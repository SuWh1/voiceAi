import base64
import traceback
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Your helper functions are imported correctly
from openai_api import transcribe_audio, chat_and_get_speech

app = FastAPI()

# Make sure your React app's origin is allowed. 
# Using "http://localhost:3000" is more secure than "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # The URL of your React app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model for type-checking the incoming request body from the frontend
class ChatPayload(BaseModel):
    text: str
    history: list = []
    voice: str = "nova"

@app.get("/")
def read_root():
    return {"status": "API is running"}

@app.post("/transcribe")
async def endpoint_transcribe(file: UploadFile = File(...)):
    """
    Endpoint to transcribe audio. It receives an audio file and returns the text.
    """
    try:
        return await transcribe_audio(file)
    except Exception as e:
        print(f"Error in /transcribe: {e}")
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=500)

# --- THIS IS THE CORRECTED AND CONSOLIDATED ENDPOINT ---
@app.post("/chat") # Defined at "/chat" to match the frontend call
async def endpoint_chat(payload: ChatPayload):
    """
    This single endpoint receives text, gets the AI's text and voice response,
    and sends them back together.
    """
    try:
        # This function correctly returns both audio bytes and the reply text
        audio_bytes, reply_text = await chat_and_get_speech(
            user_text=payload.text,
            history=payload.history,
            voice=payload.voice
        )
        
        # Encode the binary audio data to a Base64 string so it can be sent in JSON
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

        # Return the JSON object that the frontend is expecting
        return {
            "reply_text": reply_text,
            "reply_audio": audio_base64
        }
    except Exception as e:
        print(f"Error in /chat: {e}")
        traceback.print_exc()
        return JSONResponse(content={"error": f"Internal Server Error: {e}"}, status_code=500)