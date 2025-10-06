// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

// --- Configuration ---
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = "kdmDKE6EkgrWrrykO9Qt"; // Example: Rachel's voice
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY; // NVIDIA API Key from build.nvidia.com
const NVIDIA_FUNCTION_ID = process.env.NVIDIA_FUNCTION_ID; // Function ID from NVIDIA
const A2F_SERVER_ADDRESS = "grpc.nvcf.nvidia.com:443"; // NVIDIA Cloud gRPC endpoint
const PROTO_PATH =
  __dirname +
  "/proto/protobuf_files/nvidia_ace.services.a2f_controller.v1.proto";

// --- Express App Setup ---
const app = express();
app.use(bodyParser.json());
const port = 3000;

// --- gRPC Client Setup ---
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [__dirname + "/proto/protobuf_files"],
});
const a2f_proto =
  grpc.loadPackageDefinition(packageDefinition).nvidia_ace.services
    .a2f_controller.v1;

// Create SSL credentials for secure connection to NVIDIA cloud
const sslCredentials = grpc.credentials.createSsl();

// Create metadata callback for API key authentication
const metadata = new grpc.Metadata();
metadata.add("function-id", NVIDIA_FUNCTION_ID);
metadata.add("authorization", `Bearer ${NVIDIA_API_KEY}`);

// Create channel credentials combining SSL and metadata
const callCredentials = grpc.credentials.createFromMetadataGenerator(
  (params, callback) => {
    callback(null, metadata);
  }
);
const channelCredentials = grpc.credentials.combineChannelCredentials(
  sslCredentials,
  callCredentials
);

const a2fClient = new a2f_proto.A2FControllerService(
  A2F_SERVER_ADDRESS,
  channelCredentials
);

// --- The Main REST Endpoint ---
app.post("/generate-animation", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text input is required." });
  }

  console.log(`Received request for text: "${text}"`);

  try {
    // == STEP 1 & 2: Call ElevenLabs to get TTS Audio in the correct format ==
    console.log("Requesting audio from ElevenLabs in PCM 16kHz format...");
    const ttsResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          // Requesting the specific PCM format required by Audio2Face
          Accept: "audio/raw",
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        // Add output_format to the query parameters
        params: {
          output_format: "pcm_16000",
        },
        responseType: "arraybuffer",
      }
    );

    const audioBuffer = Buffer.from(ttsResponse.data);
    console.log(
      `Received PCM audio buffer from ElevenLabs (${audioBuffer.length} bytes).`
    );

    // == STEP 3 & 4: Send Audio to Audio2Face and Receive Animation ==
    console.log("Sending audio to Audio2Face...");
    const { frames, blendshapeNames } = await getA2FAnimation(audioBuffer);
    console.log(`Received ${frames.length} animation frames from A2F.`);

    // == STEP 5: Package and Return the Response ==
    res.json({
      text: text,
      // Encode audio to Base64 to safely embed it in the JSON response
      audioData: audioBuffer.toString("base64"),
      // Note: The audio format is raw PCM, 16kHz, 16-bit, mono.
      // The client (Unity) will need to know this to play it back correctly.
      audioFormat: "pcm_16000",
      blendshapeNames: blendshapeNames,
      animationData: frames,
    });
  } catch (error) {
    // Provide more detailed error logging
    if (error.response) {
      console.error(
        "Error during API call:",
        error.response.status,
        error.response.data.toString()
      );
    } else {
      console.error("An error occurred during the pipeline:", error.message);
    }
    res.status(500).json({ error: "Failed to process the request." });
  }
});

/**
 * A helper function to wrap the gRPC streaming call in a Promise.
 * @param {Buffer} audioBuffer - The raw PCM audio data.
 * @returns {Promise<Array<Object>>} - A promise that resolves with an array of animation data frames.
 */
function getA2FAnimation(audioBuffer) {
  return new Promise((resolve, reject) => {
    const call = a2fClient.ProcessAudioStream();
    const frames = [];
    let blendshapeNames = [];

    call.on("data", (data) => {
      // Store the animation data stream header if present
      if (data.animation_data_stream_header) {
        console.log("Received animation data stream header");
        if (data.animation_data_stream_header.skel_animation_header) {
          blendshapeNames =
            data.animation_data_stream_header.skel_animation_header
              .blend_shapes;
          console.log(`Blendshape names: ${blendshapeNames.join(", ")}`);
        }
      }
      // Store animation data frames
      if (data.animation_data) {
        frames.push(data.animation_data);
      }
      // Handle status messages
      if (data.status) {
        console.log(
          `Status: ${data.status.message} (code: ${data.status.code})`
        );
      }
    });
    call.on("end", () => resolve({ frames, blendshapeNames }));
    call.on("error", (err) => {
      console.error("gRPC Error:", err);
      reject(err);
    });

    // 1. Send AudioStreamHeader with the correct structure
    call.write({
      audio_stream_header: {
        audio_header: {
          audio_format: 0, // AUDIO_FORMAT_PCM
          channel_count: 1, // Mono
          samples_per_second: 16000,
          bits_per_sample: 16,
        },
      },
    });

    // 2. Send audio data in chunks (16000 samples = 1 second at 16kHz)
    const CHUNK_SIZE = 16000 * 2; // 2 bytes per sample (16-bit)
    let offset = 0;

    while (offset < audioBuffer.length) {
      const chunk = audioBuffer.slice(offset, offset + CHUNK_SIZE);
      call.write({
        audio_with_emotion: {
          audio_buffer: chunk,
          emotions: [], // Optional: Add emotion data with timecodes
        },
      });
      offset += CHUNK_SIZE;
    }

    // 3. Send EndOfAudio to signal completion
    call.write({
      end_of_audio: {},
    });

    // 4. Close the write side of the stream
    call.end();
  });
}

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
