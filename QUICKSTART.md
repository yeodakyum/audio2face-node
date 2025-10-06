# Quick Setup Guide - NVIDIA Cloud Edition

## 🚀 Get Started in 5 Minutes

### Step 1: Get Your API Keys

#### NVIDIA API (Required)

1. Go to [https://build.nvidia.com/nvidia/audio2face-3d](https://build.nvidia.com/nvidia/audio2face-3d)
2. Sign in or create an NVIDIA account
3. Click **"Get API Key"**
4. Copy both:
   - **API Key** (starts with `nvapi-`)
   - **Function ID** (UUID format)

#### ElevenLabs API (Required)

1. Go to [https://elevenlabs.io](https://elevenlabs.io)
2. Sign up or log in
3. Go to your Profile → API Keys
4. Copy your **API Key** (starts with `sk_`)

### Step 2: Install Dependencies

```bash
cd node_js_server
npm install
```

### Step 3: Configure Environment

```bash
# Copy the example .env file
cp .env.example .env

# Edit .env and add your API keys
nano .env
```

Your `.env` should look like:

```env
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxx
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxx
NVIDIA_FUNCTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PORT=3000
```

### Step 4: Test Connection

```bash
npm run test-grpc
```

Expected output:

```
=== Audio2Face-3D NVIDIA Cloud gRPC Connection Test ===

Loading proto files...
✓ Proto files loaded successfully

Connecting to NVIDIA Cloud at grpc.nvcf.nvidia.com:443...
  Function ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  API Key: nvapi-xxxx...
✓ gRPC client created with SSL and API key authentication

Using sample audio: /path/to/Claire_neutral.wav
Audio buffer size: 152044 bytes

Initiating bidirectional stream...
Sending AudioStreamHeader...
✓ Header sent
Sending audio data...
✓ Audio data sent
Sending end of audio signal...
✓ End of audio sent
✓ Stream write closed, waiting for response from NVIDIA Cloud...
✓ Received animation data stream header
✓ Blendshape names received: 52 blendshapes
  First few: eyeBlinkLeft, eyeBlinkRight, eyeLookDownLeft...
✓ Receiving animation frames...

✓ Status received: Success (code: 0)

✓ Stream ended. Received 47 animation frames.

=== Test Summary ===
✓ Connection: SUCCESS
✓ Header received: YES
✓ Animation frames: 47
✓ Blendshapes: 52

✓✓✓ All tests passed! NVIDIA Cloud gRPC connection is working correctly. ✓✓✓
```

### Step 5: Start the Server

```bash
npm start
```

Expected output:

```
Server listening at http://localhost:3000
```

### Step 6: Test the API

Open a new terminal and run:

```bash
curl -X POST http://localhost:3000/generate-animation \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello! This is a test."}'
```

You should receive a JSON response with:

- `audioData`: Base64-encoded audio
- `blendshapeNames`: Array of 52 blendshape names
- `animationData`: Array of animation frames with timecodes

## ✅ You're Done!

Your server is now:

- ✅ Connected to NVIDIA Audio2Face-3D Cloud
- ✅ Connected to ElevenLabs TTS
- ✅ Ready to generate voice and facial animations from text

## 🎯 Next Steps

### Use in Your Application

**JavaScript/Web:**

```javascript
const response = await fetch("http://localhost:3000/generate-animation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Your text here" }),
});
const data = await response.json();
console.log("Blendshapes:", data.blendshapeNames);
console.log("Animation frames:", data.animationData.length);
```

**Unity C#:**

```csharp
using UnityEngine.Networking;

IEnumerator GenerateAnimation(string text) {
    var json = JsonUtility.ToJson(new { text = text });
    using (var request = UnityWebRequest.Post(
        "http://localhost:3000/generate-animation", json, "application/json")) {
        yield return request.SendWebRequest();
        if (request.result == UnityWebRequest.Result.Success) {
            var data = JsonUtility.FromJson<Response>(request.downloadHandler.text);
            // Use data.audioData and data.animationData
        }
    }
}
```

**Python:**

```python
import requests

response = requests.post('http://localhost:3000/generate-animation',
    json={'text': 'Your text here'})
data = response.json()
print(f"Blendshapes: {data['blendshapeNames']}")
print(f"Animation frames: {len(data['animationData'])}")
```

## 🔧 Troubleshooting

### Test Fails with Authentication Error

```
✗ gRPC Error: 16 UNAUTHENTICATED
```

**Solution:** Check your `.env` file:

- Make sure `NVIDIA_API_KEY` is correct
- Make sure `NVIDIA_FUNCTION_ID` is correct
- No extra spaces or quotes around the values

### Test Fails with Connection Error

```
✗ gRPC Error: 14 UNAVAILABLE
```

**Solutions:**

1. Check your internet connection
2. Check if firewall is blocking port 443
3. Try a different network

### ElevenLabs Returns 401

**Solution:**

1. Check `ELEVENLABS_API_KEY` in `.env`
2. Verify your account has credits at [elevenlabs.io](https://elevenlabs.io)

### Server Starts But Can't Connect

**Solution:**

```bash
# Check if server is running
curl http://localhost:3000/generate-animation

# Check the port
netstat -an | grep 3000

# Try a different port in .env
PORT=3001
```

## 📚 Full Documentation

See [README.md](./README.md) for complete documentation including:

- Detailed API reference
- Client integration examples (Unity, Web)
- Performance notes
- Blendshape reference
- Advanced configuration

## 💡 Tips

1. **Free Tier Limits:** NVIDIA and ElevenLabs have rate limits on free tiers
2. **Audio Length:** Longer audio takes more time to process
3. **Caching:** Consider caching responses for repeated text
4. **Production:** Use environment variables for API keys, never commit them
5. **HTTPS:** In production, use HTTPS for your REST API

## 🎉 Happy Coding!

You now have a working text-to-animation pipeline using NVIDIA's cloud API.
No local Audio2Face-3D installation required!
