import os
from openai import AsyncOpenAI
from dotenv import load_dotenv
from fastapi import UploadFile

# Load environment variables from .env file
load_dotenv()

# Initialize the async OpenAI client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# A simple in-memory cache for transcriptions to avoid re-processing
transcription_cache = {}

async def transcribe_audio(file: UploadFile):
    """
    Transcribes the given audio file using OpenAI's Whisper model.
    """
    file_content = await file.read()
    file_key = hash(file_content)

    # Check cache first
    if file_key in transcription_cache:
        return {"text": transcription_cache[file_key]}

    # Create a file-like object for the OpenAI API
    # The filename is important for the API to determine the file type
    file_for_openai = (file.filename, file_content, file.content_type)
    
    try:
        transcription = await client.audio.transcriptions.create(
            model="whisper-1",
            file=file_for_openai,
        )
        transcribed_text = transcription.text
        # Cache the result
        transcription_cache[file_key] = transcribed_text
        return {"text": transcribed_text}
    except Exception as e:
        # It's good practice to log the error
        print(f"Error during transcription: {e}")
        raise e


async def chat_and_get_speech(user_text: str, history: list, voice: str = "nova"):
    """
    1. Gets a text response from GPT based on us    er text and history.
    2. Converts the text response to speech using OpenAI's TTS model.
    3. Returns both the AI's text reply and the audio bytes.
    """
    # 1. Get Text Response from GPT
    messages = [
        {"role": "system", "content": "You are a helpful voice assistant. Keep your answers concise and conversational."},
        *history,
        {"role": "user", "content": user_text}
    ]

    try:
        chat_completion = await client.chat.completions.create(
            model="gpt-3.5-turbo-0125",  # or "gpt-3.5-turbo"
            messages=messages
        )
        reply_text = chat_completion.choices[0].message.content

        # 2. Convert Text to Speech
        speech_response = await client.audio.speech.create(
            model="tts-1",
            voice=voice, # 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
            input=reply_text
        )
        
        # Read the audio data into bytes
        audio_bytes = await speech_response.aread()

        return audio_bytes, reply_text

    except Exception as e:
        print(f"Error during chat/speech generation: {e}")
        raise e