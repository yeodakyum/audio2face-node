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

- **NVIDIA API Key** and **Function ID** from [build.nvidia.com](https://build.nvidia.com/nvidia/audio2face-3d)
- **ElevenLabs API Key** from [elevenlabs.io](https://elevenlabs.io)

## Getting Your NVIDIA API Credentials

1. Visit [https://build.nvidia.com/nvidia/audio2face-3d](https://build.nvidia.com/nvidia/audio2face-3d)
2. Sign in with your NVIDIA account (or create one)
3. Click "Get API Key" to generate your API key
4. Copy your **API Key** and **Function ID** - you'll need both



## Usage

### Step 1: Start the Server


```bash
npm start
```

Or 

```bash
node inde.js
```

The server will start on `http://localhost:3000`

### Step 2: Test the REST API

**Example cURL Request:**

```bash
curl -X POST http://localhost:3000/generate-animation \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world! This is a test."}'
```

