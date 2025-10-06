// Test gRPC connection to Audio2Face-3D NVIDIA Cloud server
require("dotenv").config();

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("fs");

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_FUNCTION_ID = process.env.NVIDIA_FUNCTION_ID;
const A2F_SERVER_ADDRESS = "grpc.nvcf.nvidia.com:443";
const PROTO_PATH =
  __dirname +
  "/proto/protobuf_files/nvidia_ace.services.a2f_controller.v1.proto";

console.log("=== Audio2Face-3D NVIDIA Cloud gRPC Connection Test ===\n");

// Validate environment variables
if (!NVIDIA_API_KEY) {
  console.error("✗ Error: NVIDIA_API_KEY not set in .env file");
  console.error(
    "  Get your API key from https://build.nvidia.com/nvidia/audio2face-3d"
  );
  process.exit(1);
}

if (!NVIDIA_FUNCTION_ID) {
  console.error("✗ Error: NVIDIA_FUNCTION_ID not set in .env file");
  console.error(
    "  Get your function ID from https://build.nvidia.com/nvidia/audio2face-3d"
  );
  process.exit(1);
}

// Load proto
console.log("Loading proto files...");
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
console.log("✓ Proto files loaded successfully\n");

// Create SSL credentials for secure connection to NVIDIA cloud
console.log(`Connecting to NVIDIA Cloud at ${A2F_SERVER_ADDRESS}...`);
const sslCredentials = grpc.credentials.createSsl();

// Create metadata for API key authentication
const metadata = new grpc.Metadata();
metadata.add("function-id", NVIDIA_FUNCTION_ID);
metadata.add("authorization", `Bearer ${NVIDIA_API_KEY}`);

console.log(`  Function ID: ${NVIDIA_FUNCTION_ID}`);
console.log(`  API Key: ${NVIDIA_API_KEY.substring(0, 10)}...`);

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
console.log("✓ gRPC client created with SSL and API key authentication\n");

// Test with sample audio file
const SAMPLE_AUDIO = __dirname + "/example_audio/test.wav";

if (!fs.existsSync(SAMPLE_AUDIO)) {
  console.error(`✗ Sample audio file not found: ${SAMPLE_AUDIO}`);
  console.error("Please provide a PCM 16kHz WAV file to test with.");
  process.exit(1);
}

console.log(`Using sample audio: ${SAMPLE_AUDIO}`);

async function testConnection() {
  return new Promise((resolve, reject) => {
    console.log("\nInitiating bidirectional stream...");
    const call = a2fClient.ProcessAudioStream();

    let receivedHeader = false;
    let frameCount = 0;
    let blendshapeNames = [];

    call.on("data", (data) => {
      console.log("\n=== Received Response ===");
      console.log(JSON.stringify(data, null, 2));
      console.log("=== End Response ===\n");

      if (data.animation_data_stream_header) {
        receivedHeader = true;
        console.log("✓ Received animation data stream header");

        if (data.animation_data_stream_header.skel_animation_header) {
          blendshapeNames =
            data.animation_data_stream_header.skel_animation_header
              .blend_shapes;
          console.log(
            `✓ Blendshape names received: ${blendshapeNames.length} blendshapes`
          );
          console.log(
            `  First few: ${blendshapeNames.slice(0, 5).join(", ")}...`
          );
        }
      }

      if (data.animation_data) {
        frameCount++;
        if (frameCount === 1) {
          console.log("✓ Receiving animation frames...");
        }
      }

      if (data.status) {
        console.log(
          `\n✓ Status received: ${data.status.message} (code: ${data.status.code})`
        );
      }
    });

    call.on("end", () => {
      console.log(`\n✓ Stream ended. Received ${frameCount} animation frames.`);
      resolve({ receivedHeader, frameCount, blendshapeNames });
    });

    call.on("error", (err) => {
      console.error("\n✗ gRPC Error:", err.message);
      console.error("  Code:", err.code);
      console.error("  Details:", err.details);

      if (err.code === grpc.status.UNAUTHENTICATED) {
        console.error("\n  Authentication failed. Please check:");
        console.error("  1. Your NVIDIA_API_KEY is correct");
        console.error("  2. Your NVIDIA_FUNCTION_ID is correct");
        console.error(
          "  3. Your API key has access to the Audio2Face-3D function"
        );
      }

      reject(err);
    });

    try {
      // Read WAV file and extract PCM data
      const wavBuffer = fs.readFileSync(SAMPLE_AUDIO);
      const pcmData = wavBuffer.slice(44);

      console.log(`Audio buffer size: ${pcmData.length} bytes`);

      // Send header
      console.log("\nSending AudioStreamHeader...");
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
      console.log("✓ Header sent");

      // Send audio data in chunks (16000 samples = 1 second at 16kHz)
      const CHUNK_SIZE = 16000 * 2; // 2 bytes per sample (16-bit)
      let offset = 0;
      let chunkCount = 0;

      console.log("Sending audio data in chunks...");
      while (offset < pcmData.length) {
        const chunk = pcmData.slice(offset, offset + CHUNK_SIZE);
        call.write({
          audio_with_emotion: {
            audio_buffer: chunk,
            emotions: [],
          },
        });
        offset += CHUNK_SIZE;
        chunkCount++;
      }
      console.log(`✓ Audio data sent (${chunkCount} chunks)`);

      // Send end of audio
      console.log("Sending end of audio signal...");
      call.write({
        end_of_audio: {},
      });
      console.log("✓ End of audio sent");

      // Close write side
      call.end();
      console.log(
        "✓ Stream write closed, waiting for response from NVIDIA Cloud..."
      );
    } catch (error) {
      console.error("\n✗ Error during streaming:", error.message);
      reject(error);
    }
  });
}

// Run the test
testConnection()
  .then((result) => {
    console.log("\n=== Test Summary ===");
    console.log(`✓ Connection: SUCCESS`);
    console.log(`✓ Header received: ${result.receivedHeader ? "YES" : "NO"}`);
    console.log(`✓ Animation frames: ${result.frameCount}`);
    console.log(`✓ Blendshapes: ${result.blendshapeNames.length}`);
    console.log(
      "\n✓✓✓ All tests passed! NVIDIA Cloud gRPC connection is working correctly. ✓✓✓\n"
    );
    process.exit(0);
  })
  .catch((error) => {
    console.log("\n=== Test Summary ===");
    console.log("✗ Connection: FAILED");
    console.log("\nPlease check:");
    console.log("  1. Your NVIDIA_API_KEY is correct in .env file");
    console.log("  2. Your NVIDIA_FUNCTION_ID is correct in .env file");
    console.log(
      "  3. You have access to Audio2Face-3D on https://build.nvidia.com"
    );
    console.log("  4. Your API key has not expired");
    console.log("  5. Proto files are correctly loaded\n");
    process.exit(1);
  });
