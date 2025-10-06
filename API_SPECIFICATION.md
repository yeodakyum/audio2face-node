# Audio2Face-3D API Specification

Complete technical specification for integrating with NVIDIA Audio2Face-3D Cloud API.

---

## Table of Contents

1. [Authentication](#authentication)
2. [gRPC Connection Setup](#grpc-connection-setup)
3. [Request Structure](#request-structure)
4. [Response Structure](#response-structure)
5. [Message Flow](#message-flow)
6. [Data Types](#data-types)
7. [Error Handling](#error-handling)
8. [Code Examples](#code-examples)

---

## Authentication

### Required Credentials

- **NVIDIA_API_KEY**: API key from build.nvidia.com (format: `nvapi-xxxxx`)
- **NVIDIA_FUNCTION_ID**: Function ID (UUID format)

### Connection Details

- **Endpoint**: `grpc.nvcf.nvidia.com:443`
- **Protocol**: gRPC with SSL/TLS
- **Authentication**: Bearer token in metadata headers

### Metadata Headers

```javascript
metadata.add("function-id", NVIDIA_FUNCTION_ID);
metadata.add("authorization", `Bearer ${NVIDIA_API_KEY}`);
```

---

## gRPC Connection Setup

### 1. Load Proto Files

```javascript
const protoLoader = require("@grpc/proto-loader");
const PROTO_PATH =
  "./proto/protobuf_files/nvidia_ace.services.a2f_controller.v1.proto";

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: ["./proto/protobuf_files"],
});

const a2f_proto =
  grpc.loadPackageDefinition(packageDefinition).nvidia_ace.services
    .a2f_controller.v1;
```

### 2. Create SSL Credentials

```javascript
const grpc = require("@grpc/grpc-js");

// SSL for HTTPS connection
const sslCredentials = grpc.credentials.createSsl();

// Metadata for API authentication
const metadata = new grpc.Metadata();
metadata.add("function-id", NVIDIA_FUNCTION_ID);
metadata.add("authorization", `Bearer ${NVIDIA_API_KEY}`);

// Combine SSL + metadata
const callCredentials = grpc.credentials.createFromMetadataGenerator(
  (params, callback) => {
    callback(null, metadata);
  }
);

const channelCredentials = grpc.credentials.combineChannelCredentials(
  sslCredentials,
  callCredentials
);
```

### 3. Create Client

```javascript
const a2fClient = new a2f_proto.A2FControllerService(
  "grpc.nvcf.nvidia.com:443",
  channelCredentials
);
```

---

## Request Structure

### Service Method

```protobuf
service A2FControllerService {
  rpc ProcessAudioStream(stream AudioStream)
    returns (stream AnimationDataStream) {}
}
```

### Request Stream: AudioStream

The client sends a stream of `AudioStream` messages in this order:

#### 1. AudioStreamHeader (First Message)

```javascript
{
  audio_stream_header: {
    audio_header: {
      audio_format: 0,           // 0 = AUDIO_FORMAT_PCM
      channel_count: 1,          // 1 = Mono
      samples_per_second: 16000, // 16kHz sample rate
      bits_per_sample: 16        // 16-bit audio
    },
    // Optional fields:
    face_params: {
      float_params: {
        "lowerFaceSmoothing": 0.5,
        "upperFaceSmoothing": 0.5,
        // ... more parameters
      }
    },
    blendshape_params: {
      bs_weight_multipliers: {
        "jawOpen": 1.0,
        // ... more blendshapes
      },
      bs_weight_offsets: {
        "jawOpen": 0.0,
        // ... more blendshapes
      }
    },
    emotion_post_processing_params: {
      emotion_contrast: 1.0,
      live_blend_coef: 0.7,
      emotion_strength: 0.6,
      max_emotions: 3
    }
  }
}
```

**Field Details:**

- `audio_format`: Always `0` (PCM format)
- `channel_count`: Always `1` (mono audio)
- `samples_per_second`: Always `16000` (16kHz)
- `bits_per_sample`: Always `16` (16-bit)
- `face_params`: Optional facial parameter adjustments
- `blendshape_params`: Optional blendshape multipliers and offsets
- `emotion_post_processing_params`: Optional emotion processing parameters

#### 2. AudioWithEmotion (Multiple Messages)

Send audio data in chunks. Recommended chunk size: **32KB (1 second of audio)**.

```javascript
{
  audio_with_emotion: {
    audio_buffer: Buffer,  // Raw PCM audio bytes (chunk)
    emotions: [            // Optional emotion data
      {
        time_code: 0.0,    // Time in seconds
        emotion: {
          "joy": 0.8,
          "anger": 0.0,
          "sadness": 0.2
        }
      }
    ]
  }
}
```

**Chunking Example:**

```javascript
const CHUNK_SIZE = 16000 * 2; // 1 second (16kHz * 2 bytes/sample)
let offset = 0;

while (offset < audioBuffer.length) {
  const chunk = audioBuffer.slice(offset, offset + CHUNK_SIZE);
  call.write({
    audio_with_emotion: {
      audio_buffer: chunk,
      emotions: [],
    },
  });
  offset += CHUNK_SIZE;
}
```

**Available Emotions:**

- `amazement`
- `anger`
- `cheekiness`
- `disgust`
- `fear`
- `grief`
- `joy`
- `outofbreath`
- `pain`
- `sadness`

Values range from `0.0` to `1.0`.

#### 3. EndOfAudio (Final Message)

```javascript
{
  end_of_audio: {
  } // Empty object to signal stream end
}
```

**Complete Request Flow:**

```javascript
const call = a2fClient.ProcessAudioStream();

// 1. Send header
call.write({ audio_stream_header: { ... } });

// 2. Send audio in chunks
while (hasMoreAudio) {
  call.write({ audio_with_emotion: { audio_buffer: chunk, emotions: [] } });
}

// 3. Send end signal
call.write({ end_of_audio: {} });

// 4. Close write side
call.end();
```

---

## Response Structure

### Response Stream: AnimationDataStream

The server sends a stream of `AnimationDataStream` messages:

#### 1. AnimationDataStreamHeader (First Response)

```javascript
{
  animation_data_stream_header: {
    audio_header: {
      audio_format: 0,
      channel_count: 1,
      samples_per_second: 16000,
      bits_per_sample: 16
    },
    skel_animation_header: {
      blend_shapes: [
        "eyeBlinkLeft",
        "eyeBlinkRight",
        "eyeLookDownLeft",
        "eyeLookInLeft",
        "eyeLookOutLeft",
        "eyeLookUpLeft",
        "eyeSquintLeft",
        "eyeWideLeft",
        "eyeBlinkRight",
        "eyeLookDownRight",
        "eyeLookInRight",
        "eyeLookOutRight",
        "eyeLookUpRight",
        "eyeSquintRight",
        "eyeWideRight",
        "jawForward",
        "jawLeft",
        "jawRight",
        "jawOpen",
        "mouthClose",
        "mouthFunnel",
        "mouthPucker",
        "mouthLeft",
        "mouthRight",
        "mouthSmileLeft",
        "mouthSmileRight",
        "mouthFrownLeft",
        "mouthFrownRight",
        "mouthDimpleLeft",
        "mouthDimpleRight",
        "mouthStretchLeft",
        "mouthStretchRight",
        "mouthRollLower",
        "mouthRollUpper",
        "mouthShrugLower",
        "mouthShrugUpper",
        "mouthPressLeft",
        "mouthPressRight",
        "mouthLowerDownLeft",
        "mouthLowerDownRight",
        "mouthUpperUpLeft",
        "mouthUpperUpRight",
        "browDownLeft",
        "browDownRight",
        "browInnerUp",
        "browOuterUpLeft",
        "browOuterUpRight",
        "cheekPuff",
        "cheekSquintLeft",
        "cheekSquintRight",
        "noseSneerLeft",
        "noseSneerRight",
        "tongueOut"
      ],
      joints: []  // Currently empty
    },
    start_time_code_since_epoch: 1728086400.0  // Unix timestamp
  }
}
```

**Field Details:**

- `blend_shapes`: Array of 52 ARKit blendshape names (order is important!)
- `joints`: Joint names (currently not used)
- `start_time_code_since_epoch`: Absolute timestamp in seconds since Unix epoch

#### 2. AnimationData (Multiple Responses)

```javascript
{
  animation_data: {
    skel_animation: {
      blend_shape_weights: [
        {
          time_code: 0.0,    // Time in seconds from start
          values: [          // 52 float values (0.0 to 1.0)
            0.0,  // eyeBlinkLeft
            0.0,  // eyeBlinkRight
            0.1,  // eyeLookDownLeft
            0.05, // eyeLookInLeft
            // ... 48 more values
          ]
        },
        {
          time_code: 0.033,  // Next frame (30 FPS)
          values: [0.0, 0.0, 0.12, 0.06, ...]
        }
        // ... more frames
      ],
      translations: [],  // Currently empty
      rotations: [],     // Currently empty
      scales: []         // Currently empty
    },
    audio: {
      time_code: 0.0,
      audio_buffer: Buffer  // Processed audio bytes
    },
    metadata: {
      emotion_aggregate: {
        // Emotion data (protobuf Any type)
        type_url: "type.googleapis.com/nvidia_ace.emotion_aggregate.v1.EmotionAggregate",
        value: Buffer  // Serialized EmotionAggregate
      }
    }
  }
}
```

**Field Details:**

- `time_code`: Relative time in seconds from audio start
- `values`: Array of 52 floats matching the order in `blend_shapes`
- `audio_buffer`: Processed audio data (same as input)
- `metadata`: Additional data like emotions

**Blendshape Value Mapping:**

```javascript
// The order of values matches the order of blend_shapes
const blendshapeNames = header.skel_animation_header.blend_shapes;
const blendshapeValues = frame.blend_shape_weights[0].values;

// To get specific blendshape value:
const jawOpenIndex = blendshapeNames.indexOf("jawOpen");
const jawOpenValue = blendshapeValues[jawOpenIndex];

// Or create a map:
const blendshapeMap = {};
blendshapeNames.forEach((name, index) => {
  blendshapeMap[name] = blendshapeValues[index];
});
console.log(blendshapeMap.jawOpen); // 0.25
```

#### 3. Status (Final Response)

```javascript
{
  status: {
    code: 0,        // 0=SUCCESS, 1=INFO, 2=WARNING, 3=ERROR
    message: "Success"
  }
}
```

**Status Codes:**

- `0`: SUCCESS - Processing completed successfully
- `1`: INFO - Informational message
- `2`: WARNING - Warning, but processing completed
- `3`: ERROR - Error occurred during processing

---

## Message Flow

### Complete Flow Diagram

```
Client                                    Server
  |                                         |
  |-- audio_stream_header ----------------->|
  |                                         |
  |-- audio_with_emotion (chunk 1) -------->|
  |-- audio_with_emotion (chunk 2) -------->|
  |-- audio_with_emotion (chunk 3) -------->|
  |-- ...                                   |
  |                                         |
  |-- end_of_audio ------------------------>|
  |                                         |
  |<-- animation_data_stream_header --------|
  |                                         |
  |<-- animation_data (frame 1) ------------|
  |<-- animation_data (frame 2) ------------|
  |<-- animation_data (frame 3) ------------|
  |<-- ...                                  |
  |                                         |
  |<-- status -----------------------------|
  |                                         |
```

### Timing

- Audio chunks: Sent immediately one after another
- Response: Starts after `end_of_audio` is received
- Animation frames: Sent as they're generated (~30 FPS)
- Latency: Typically 1-3 seconds for 5-second audio

---

## Data Types

### Audio Format

- **Format**: Raw PCM (Pulse Code Modulation)
- **Sample Rate**: 16000 Hz (16 kHz)
- **Bit Depth**: 16 bits per sample
- **Channels**: 1 (Mono)
- **Byte Order**: Little-endian
- **Data Type**: Signed 16-bit integer

### Converting Audio to Buffer

```javascript
// From WAV file (skip 44-byte header)
const fs = require("fs");
const wavBuffer = fs.readFileSync("audio.wav");
const pcmBuffer = wavBuffer.slice(44);

// From Float32Array (Web Audio API)
const float32Array = audioContext.getChannelData(0);
const int16Array = new Int16Array(float32Array.length);
for (let i = 0; i < float32Array.length; i++) {
  int16Array[i] = Math.max(-32768, Math.min(32767, float32Array[i] * 32768));
}
const pcmBuffer = Buffer.from(int16Array.buffer);
```

### Blendshape Values

- **Type**: Float
- **Range**: 0.0 to 1.0 (clamped)
- **Count**: 52 values per frame
- **Frame Rate**: ~30 FPS (0.033 seconds between frames)

### Time Codes

- **Type**: Double (64-bit float)
- **Unit**: Seconds
- **Reference**: Relative to audio start (0.0 = start)
- **Precision**: Millisecond accuracy

---

## Error Handling

### Common Errors

#### 1. Authentication Failed

```javascript
{
  code: 16,  // UNAUTHENTICATED
  message: "Authentication failed",
  details: "Invalid API key or Function ID"
}
```

**Solution**: Verify `NVIDIA_API_KEY` and `NVIDIA_FUNCTION_ID`

#### 2. Message Too Large

```javascript
{
  code: 8,  // RESOURCE_EXHAUSTED
  message: "Received message larger than max",
  details: "Message size exceeded"
}
```

**Solution**: Send audio in smaller chunks (max 32KB recommended)

#### 3. Invalid Audio Format

```javascript
{
  code: 3,  // INVALID_ARGUMENT
  message: "Invalid audio format",
  details: "Audio must be PCM 16kHz mono"
}
```

**Solution**: Ensure audio is PCM, 16kHz, 16-bit, mono

#### 4. Rate Limit Exceeded

```javascript
{
  code: 8,  // RESOURCE_EXHAUSTED
  message: "Rate limit exceeded",
  details: "Too many requests"
}
```

**Solution**: Implement retry with exponential backoff

### Error Handling Code

```javascript
call.on("error", (err) => {
  console.error("gRPC Error:", err.code, err.message);

  switch (err.code) {
    case grpc.status.UNAUTHENTICATED:
      console.error("Check API credentials");
      break;
    case grpc.status.RESOURCE_EXHAUSTED:
      console.error("Rate limit or message too large");
      break;
    case grpc.status.INVALID_ARGUMENT:
      console.error("Check audio format and parameters");
      break;
    case grpc.status.UNAVAILABLE:
      console.error("Server unavailable, retry later");
      break;
    default:
      console.error("Unknown error:", err.details);
  }
});
```

---

## Code Examples

### Complete Request/Response Example

```javascript
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("fs");

// 1. Setup
const PROTO_PATH =
  "./proto/protobuf_files/nvidia_ace.services.a2f_controller.v1.proto";
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: ["./proto/protobuf_files"],
});

const a2f_proto =
  grpc.loadPackageDefinition(packageDefinition).nvidia_ace.services
    .a2f_controller.v1;

// 2. Create credentials
const sslCredentials = grpc.credentials.createSsl();
const metadata = new grpc.Metadata();
metadata.add("function-id", process.env.NVIDIA_FUNCTION_ID);
metadata.add("authorization", `Bearer ${process.env.NVIDIA_API_KEY}`);

const callCredentials = grpc.credentials.createFromMetadataGenerator(
  (params, callback) => callback(null, metadata)
);

const channelCredentials = grpc.credentials.combineChannelCredentials(
  sslCredentials,
  callCredentials
);

// 3. Create client
const client = new a2f_proto.A2FControllerService(
  "grpc.nvcf.nvidia.com:443",
  channelCredentials
);

// 4. Process audio
function processAudio(audioBuffer) {
  return new Promise((resolve, reject) => {
    const call = client.ProcessAudioStream();
    const result = {
      blendshapeNames: [],
      frames: [],
    };

    // Handle responses
    call.on("data", (data) => {
      if (data.animation_data_stream_header) {
        result.blendshapeNames =
          data.animation_data_stream_header.skel_animation_header.blend_shapes;
      }
      if (data.animation_data) {
        result.frames.push(data.animation_data);
      }
      if (data.status) {
        if (data.status.code !== 0) {
          reject(new Error(data.status.message));
        }
      }
    });

    call.on("end", () => resolve(result));
    call.on("error", reject);

    // Send request
    // Step 1: Header
    call.write({
      audio_stream_header: {
        audio_header: {
          audio_format: 0,
          channel_count: 1,
          samples_per_second: 16000,
          bits_per_sample: 16,
        },
      },
    });

    // Step 2: Audio in chunks
    const CHUNK_SIZE = 32000; // 1 second
    for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
      const chunk = audioBuffer.slice(offset, offset + CHUNK_SIZE);
      call.write({
        audio_with_emotion: {
          audio_buffer: chunk,
          emotions: [],
        },
      });
    }

    // Step 3: End signal
    call.write({ end_of_audio: {} });
    call.end();
  });
}

// 5. Usage
const audioBuffer = fs.readFileSync("audio.wav").slice(44);
processAudio(audioBuffer)
  .then((result) => {
    console.log("Blendshapes:", result.blendshapeNames);
    console.log("Frames received:", result.frames.length);

    // Process each frame
    result.frames.forEach((frame, index) => {
      frame.skel_animation.blend_shape_weights.forEach((bsWeight) => {
        console.log(`Frame ${index} at ${bsWeight.time_code}s:`);

        // Map values to names
        result.blendshapeNames.forEach((name, i) => {
          console.log(`  ${name}: ${bsWeight.values[i]}`);
        });
      });
    });
  })
  .catch((err) => console.error("Error:", err));
```

### REST API Wrapper Example

```javascript
const express = require("express");
const app = express();
app.use(express.json());

app.post("/generate-animation", async (req, res) => {
  try {
    const { audioData } = req.body; // Base64 PCM audio
    const audioBuffer = Buffer.from(audioData, "base64");

    const result = await processAudio(audioBuffer);

    res.json({
      blendshapeNames: result.blendshapeNames,
      animationData: result.frames.map((frame) => ({
        timeCode: frame.skel_animation.blend_shape_weights[0].time_code,
        values: frame.skel_animation.blend_shape_weights[0].values,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

---

## Performance Considerations

### Chunk Size

- **Recommended**: 32KB (1 second of audio)
- **Minimum**: 16KB (0.5 seconds)
- **Maximum**: 64KB (2 seconds)
- **Rationale**: Balance between network overhead and memory usage

### Expected Latency

- **Processing**: 1-3 seconds for 5-second audio
- **Network**: 100-500ms depending on location
- **Total**: ~2-4 seconds end-to-end

### Rate Limits

Check your NVIDIA account for current limits. Typical free tier:

- **Requests per minute**: 10
- **Requests per day**: 100
- **Max audio duration**: 30 seconds

### Optimization Tips

1. **Reuse gRPC client** - Don't create new client for each request
2. **Stream audio** - Send chunks as they become available
3. **Cache results** - Cache animations for repeated text
4. **Parallel processing** - Multiple clients can process different audios
5. **Connection pooling** - Keep connections alive for faster subsequent requests

---

## Reference

### Proto Files Location

```
proto/protobuf_files/
├── nvidia_ace.services.a2f_controller.v1.proto  (Main service)
├── nvidia_ace.controller.v1.proto                (Request/response messages)
├── nvidia_ace.audio.v1.proto                     (Audio header)
├── nvidia_ace.a2f.v1.proto                       (A2F-specific messages)
├── nvidia_ace.animation_data.v1.proto            (Animation data)
├── nvidia_ace.emotion_with_timecode.v1.proto     (Emotion data)
└── nvidia_ace.status.v1.proto                    (Status codes)
```

### External Resources

- **NVIDIA Build**: https://build.nvidia.com/nvidia/audio2face-3d
- **gRPC Documentation**: https://grpc.io/docs/languages/node/
- **ARKit Blendshapes**: https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-05  
**API Version**: 1.2.0
