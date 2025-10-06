# Audio2Face-3D Node.js Server with NVIDIA Cloud API

This Node.js server integrates ElevenLabs Text-to-Speech with NVIDIA Audio2Face-3D Cloud API to generate voice and facial animations from text input.

## Architecture

```
Text Input → ElevenLabs TTS → PCM Audio (16kHz) → NVIDIA Audio2Face-3D Cloud → Animation Data
```

The server:

1. Receives text input via REST API
2. Calls ElevenLabs to generate speech audio in PCM 16kHz format
3. Sends audio to NVIDIA Audio2Face-3D Cloud via secure gRPC streaming
4. Receives animation data (52 ARKit blendshapes) from Audio2Face-3D
5. Returns both audio and animation data to the client

## Prerequisites

- **Node.js** (v16 or higher)
- **NVIDIA API Key** and **Function ID** from [build.nvidia.com](https://build.nvidia.com/nvidia/audio2face-3d)
- **ElevenLabs API Key** from [elevenlabs.io](https://elevenlabs.io)

## Getting Your NVIDIA API Credentials

1. Visit [https://build.nvidia.com/nvidia/audio2face-3d](https://build.nvidia.com/nvidia/audio2face-3d)
2. Sign in with your NVIDIA account (or create one)
3. Click "Get API Key" to generate your API key
4. Copy your **API Key** and **Function ID** - you'll need both

## Installation

1. Install dependencies:

```bash
cd node_js_server
npm install
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Edit `.env` and add your API credentials:

```env
# ElevenLabs API Key
ELEVENLABS_API_KEY=sk_your_elevenlabs_api_key_here

# NVIDIA Audio2Face-3D Cloud API
NVIDIA_API_KEY=nvapi-your_nvidia_api_key_here
NVIDIA_FUNCTION_ID=your_function_id_here

# Server Port
PORT=3000
```

## Usage

### Step 1: Test gRPC Connection

Before starting the server, test your connection to NVIDIA's cloud:

```bash
npm run test-grpc
```

This will:

- ✅ Validate your API credentials
- ✅ Test the gRPC connection to NVIDIA cloud
- ✅ Send a sample audio file
- ✅ Verify you receive animation data back

### Step 2: Start the Server

Once the test passes, start the full server:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Step 3: Test the REST API

**Example cURL Request:**

```bash
curl -X POST http://localhost:3000/generate-animation \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world! This is a test."}'
```

**Example with JavaScript:**

```javascript
fetch("http://localhost:3000/generate-animation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Hello world!" }),
})
  .then((res) => res.json())
  .then((data) => {
    console.log("Audio (base64):", data.audioData.substring(0, 50) + "...");
    console.log("Blendshapes:", data.blendshapeNames);
    console.log("Animation frames:", data.animationData.length);
  });
```

## API Endpoint

### POST `/generate-animation`

Generates voice and facial animations from text.

**Request Body:**

```json
{
  "text": "Your text to convert to speech and animation"
}
```

**Response:**

```json
{
  "text": "Your text to convert to speech and animation",
  "audioData": "base64_encoded_pcm_audio_data...",
  "audioFormat": "pcm_16000",
  "blendshapeNames": [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeLookDownLeft",
    "eyeLookInLeft",
    "jawOpen",
    "mouthSmileLeft",
    "mouthSmileRight",
    "... 45 more blendshapes"
  ],
  "animationData": [
    {
      "skel_animation": {
        "blend_shape_weights": [
          {
            "time_code": 0.0,
            "values": [0.0, 0.0, 0.1, 0.2, ...]
          },
          {
            "time_code": 0.033,
            "values": [0.0, 0.0, 0.15, 0.25, ...]
          }
        ]
      },
      "audio": {
        "time_code": 0.0,
        "audio_buffer": "..."
      }
    }
  ]
}
```

## Understanding the Response

### Audio Data

- **Format:** Base64-encoded raw PCM audio
- **Sample Rate:** 16000 Hz
- **Bit Depth:** 16-bit
- **Channels:** Mono
- **Encoding:** Little-endian signed integer

### Blendshape Names

Array of 52 ARKit-compatible blendshape names that map to the values array.

### Animation Data

Each frame contains:

- **`time_code`**: Time in seconds from the start of the animation
- **`values`**: Array of 52 float values (0.0 to 1.0) for each blendshape

The order of values matches the order in `blendshapeNames`:

```javascript
blendshapeNames[0] → values[0]
blendshapeNames[1] → values[1]
// etc...
```

## Client Integration Examples

### Unity Integration

```csharp
using System;
using UnityEngine;
using UnityEngine.Networking;

public class Audio2FaceClient : MonoBehaviour
{
    [System.Serializable]
    public class Response
    {
        public string text;
        public string audioData;
        public string audioFormat;
        public string[] blendshapeNames;
        public AnimationFrame[] animationData;
    }

    [System.Serializable]
    public class AnimationFrame
    {
        public SkelAnimation skel_animation;
    }

    [System.Serializable]
    public class SkelAnimation
    {
        public BlendShapeWeight[] blend_shape_weights;
    }

    [System.Serializable]
    public class BlendShapeWeight
    {
        public float time_code;
        public float[] values;
    }

    public IEnumerator GenerateAnimation(string text)
    {
        var json = JsonUtility.ToJson(new { text = text });
        using (UnityWebRequest request = UnityWebRequest.Post(
            "http://localhost:3000/generate-animation", json, "application/json"))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                Response response = JsonUtility.FromJson<Response>(request.downloadHandler.text);

                // Decode and play audio
                byte[] audioBytes = Convert.FromBase64String(response.audioData);
                // Create AudioClip from PCM data...

                // Apply blendshapes over time
                foreach (var frame in response.animationData)
                {
                    foreach (var bsWeight in frame.skel_animation.blend_shape_weights)
                    {
                        // Apply bsWeight.values to your character's blendshapes
                        // at time bsWeight.time_code
                    }
                }
            }
        }
    }
}
```

### Web Integration

```javascript
async function generateAnimation(text) {
  const response = await fetch("http://localhost:3000/generate-animation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();

  // Decode base64 audio
  const audioBytes = atob(data.audioData);
  const audioArray = new Uint8Array(audioBytes.length);
  for (let i = 0; i < audioBytes.length; i++) {
    audioArray[i] = audioBytes.charCodeAt(i);
  }

  // Play audio using Web Audio API
  const audioContext = new AudioContext();
  const audioBuffer = audioContext.createBuffer(
    1,
    audioArray.length / 2,
    16000
  );
  const channelData = audioBuffer.getChannelData(0);

  // Convert Int16 PCM to Float32
  for (let i = 0; i < channelData.length; i++) {
    const int16 = (audioArray[i * 2 + 1] << 8) | audioArray[i * 2];
    channelData[i] = int16 / 32768.0;
  }

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();

  // Animate blendshapes
  animateBlendshapes(data.blendshapeNames, data.animationData);
}

function animateBlendshapes(names, frames) {
  frames.forEach((frame) => {
    frame.skel_animation.blend_shape_weights.forEach((bsWeight) => {
      const timeMs = bsWeight.time_code * 1000;
      setTimeout(() => {
        names.forEach((name, index) => {
          const value = bsWeight.values[index];
          // Apply to your 3D character
          applyBlendshape(name, value);
        });
      }, timeMs);
    });
  });
}
```

## gRPC Protocol Details

### Connection to NVIDIA Cloud

The server connects to NVIDIA's cloud service using:

- **Endpoint:** `grpc.nvcf.nvidia.com:443`
- **Protocol:** gRPC with SSL/TLS
- **Authentication:** Bearer token in metadata

```javascript
// Metadata sent with each request
metadata: {
  "function-id": "your_function_id",
  "authorization": "Bearer your_api_key"
}
```

### Message Flow

**Request Stream (Client → NVIDIA Cloud):**

1. `AudioStream` with `audio_stream_header`
   - Audio format: PCM, 16kHz, 16-bit, mono
2. `AudioStream` with `audio_with_emotion`
   - Raw PCM audio bytes
   - Optional emotion data
3. `AudioStream` with `end_of_audio`
   - Signals end of stream

**Response Stream (NVIDIA Cloud → Client):**

1. `AnimationDataStream` with `animation_data_stream_header`
   - Blendshape names (52 ARKit blendshapes)
2. Multiple `AnimationDataStream` with `animation_data`
   - Timecoded blendshape weights
   - Processed audio data
3. `AnimationDataStream` with `status`
   - Success/error status

## Troubleshooting

### Authentication Errors

**Error:** `UNAUTHENTICATED` or `PERMISSION_DENIED`

**Solutions:**

1. Verify your `NVIDIA_API_KEY` is correct in `.env`
2. Verify your `NVIDIA_FUNCTION_ID` is correct in `.env`
3. Check that your API key hasn't expired at [build.nvidia.com](https://build.nvidia.com)
4. Ensure you have access to the Audio2Face-3D function

### Connection Errors

**Error:** Cannot connect to server

**Solutions:**

1. Check your internet connection
2. Verify the server address is `grpc.nvcf.nvidia.com:443`
3. Check if your firewall/proxy is blocking gRPC connections
4. Try running the test script: `npm run test-grpc`

### ElevenLabs API Errors

**Error:** 401 Unauthorized

**Solutions:**

1. Verify your `ELEVENLABS_API_KEY` is correct
2. Check your ElevenLabs account has available credits
3. Visit [elevenlabs.io](https://elevenlabs.io) to check your account status

**Error:** Invalid audio format

**Solutions:**

1. The server requests `pcm_16000` format
2. Ensure ElevenLabs supports this format for your account tier
3. Check ElevenLabs API documentation for format availability

### Proto Loading Errors

**Error:** Cannot find proto file

**Solutions:**

1. Verify the `../proto/protobuf_files/` directory exists
2. Check all `.proto` files are present in that directory
3. Ensure you're running the server from the correct directory

## Development

### Project Structure

```
node_js_server/
├── index.js           # Main REST API server
├── test-grpc.js       # gRPC connection test script
├── package.json       # Dependencies and scripts
├── .env              # Environment variables (not in git)
├── .env.example      # Example environment variables
├── README.md         # This file
└── FIXES.md          # Technical implementation details
```

### Key Dependencies

- **express**: REST API server framework
- **@grpc/grpc-js**: gRPC client library for Node.js
- **@grpc/proto-loader**: Dynamic proto file loading
- **axios**: HTTP client for ElevenLabs API
- **dotenv**: Environment variable management
- **body-parser**: JSON request body parsing

### Available Scripts

```bash
npm start          # Start the production server
npm run dev        # Start development server with auto-reload
npm run test-grpc  # Test gRPC connection to NVIDIA Cloud
```

## Supported Blendshapes

The Audio2Face-3D API returns 52 ARKit-compatible blendshapes:

**Eyes:**

- eyeBlinkLeft, eyeBlinkRight
- eyeLookDownLeft, eyeLookDownRight
- eyeLookInLeft, eyeLookInRight
- eyeLookOutLeft, eyeLookOutRight
- eyeLookUpLeft, eyeLookUpRight
- eyeSquintLeft, eyeSquintRight
- eyeWideLeft, eyeWideRight

**Jaw:**

- jawForward, jawLeft, jawRight, jawOpen

**Mouth:**

- mouthClose, mouthFunnel, mouthPucker
- mouthLeft, mouthRight
- mouthSmileLeft, mouthSmileRight
- mouthFrownLeft, mouthFrownRight
- mouthDimpleLeft, mouthDimpleRight
- mouthStretchLeft, mouthStretchRight
- mouthRollLower, mouthRollUpper
- mouthShrugLower, mouthShrugUpper
- mouthPressLeft, mouthPressRight
- mouthLowerDownLeft, mouthLowerDownRight
- mouthUpperUpLeft, mouthUpperUpRight

**Brows:**

- browDownLeft, browDownRight
- browInnerUp
- browOuterUpLeft, browOuterUpRight

**Cheeks:**

- cheekPuff
- cheekSquintLeft, cheekSquintRight

**Nose:**

- noseSneerLeft, noseSneerRight

**Tongue:**

- tongueOut

## Performance Notes

- **Latency:** NVIDIA Cloud API typically responds in 1-3 seconds for a 5-second audio clip
- **Rate Limits:** Check your NVIDIA account for API rate limits
- **Audio Size:** Larger audio files will take longer to process
- **Concurrent Requests:** The server can handle multiple concurrent requests

## Resources

- **NVIDIA Audio2Face-3D:** [build.nvidia.com/nvidia/audio2face-3d](https://build.nvidia.com/nvidia/audio2face-3d)
- **ElevenLabs API:** [elevenlabs.io/docs](https://elevenlabs.io/docs)
- **gRPC Documentation:** [grpc.io](https://grpc.io)
- **ARKit Blendshapes:** [Apple Developer Documentation](https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation)

## License

Apache-2.0

## Support

For issues with:

- **This server:** Check the troubleshooting section above
- **NVIDIA API:** Contact NVIDIA support at [build.nvidia.com](https://build.nvidia.com)
- **ElevenLabs API:** Contact ElevenLabs support at [elevenlabs.io](https://elevenlabs.io)
