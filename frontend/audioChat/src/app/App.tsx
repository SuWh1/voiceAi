import { useState, useRef, useEffect } from 'react';

// --- Configuration ---
const API_BASE_URL = 'http://localhost:8000'; // Your FastAPI backend URL

// Silence Detection Configuration
const SILENCE_THRESHOLD = 0.01; // RMS volume below this is considered silence.
const SILENCE_DURATION = 1500; // 1.5 seconds of silence before automatically stopping.


// --- Type Definitions ---
type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type AppState = 'idle' | 'recording' | 'processing';


// --- UI Components (No Changes Needed) ---
const Spinner = () => (
  <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
const MicIcon = () => (
  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line>
  </svg>
);
const StopIcon = () => (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
);


// --- Main App Component ---
function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  
  // Refs for recording and audio processing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<number>(0);
  
  // Ref for scrolling chat
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);
  
  // --- Core Audio Logic ---
  
  const cleanupAudioProcessing = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    analyserRef.current?.disconnect();
    audioContextRef.current?.close();
    analyserRef.current = null;
    audioContextRef.current = null;
  };

  const startSilenceDetection = (stream: MediaStream) => {
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);

    const dataArray = new Float32Array(analyser.fftSize);
    lastSoundTimeRef.current = performance.now();

    const checkForSilence = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getFloatTimeDomainData(dataArray);
      const rms = Math.sqrt(dataArray.reduce((acc, val) => acc + val * val, 0) / dataArray.length);

      if (rms > SILENCE_THRESHOLD) {
        lastSoundTimeRef.current = performance.now();
      } else {
        if (performance.now() - lastSoundTimeRef.current > SILENCE_DURATION) {
          stopRecording(); // Automatically stop if silence duration is exceeded
          return;
        }
      }
      silenceTimerRef.current = window.setTimeout(checkForSilence, 200);
    };
    checkForSilence();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop(); // This will trigger the 'onstop' event
    }
    cleanupAudioProcessing();
  };

  const handleRecordClick = async () => {
    if (appState === 'idle') {
      try {
        setAppState('recording');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        startSilenceDetection(stream);

        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];
        mediaRecorderRef.current.addEventListener('dataavailable', (event) => {
          audioChunksRef.current.push(event.data);
        });
        mediaRecorderRef.current.addEventListener('stop', handleStopRecording);
        mediaRecorderRef.current.start();
        
      } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access the microphone. Please check permissions.');
        setAppState('idle');
      }
    } else if (appState === 'recording') {
      stopRecording(); // Manually stop recording
    }
  };

  const handleStopRecording = async () => {
    setAppState('processing');
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (audioBlob.size < 2000) { // If blob is too small, do nothing
      setAppState('idle');
      return;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'user_recording.webm');

    try {
      // 1. Transcribe audio
      const transcribeResponse = await fetch(`${API_BASE_URL}/transcribe`, { method: 'POST', body: formData });
      if (!transcribeResponse.ok) throw new Error('Transcription failed.');
      const { text: userText } = await transcribeResponse.json();
      if (!userText?.trim()) {
        setAppState('idle');
        return;
      }
      
      const newUserMessage: Message = { role: 'user', content: userText };
      const updatedHistory = [...chatHistory, newUserMessage];
      setChatHistory(updatedHistory);

      // 2. Get AI response using our single, efficient endpoint
      const chatResponse = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, history: updatedHistory }),
      });
      if (!chatResponse.ok) throw new Error('Chat response failed.');

      const { reply_text, reply_audio } = await chatResponse.json();
      const newAssistantMessage: Message = { role: 'assistant', content: reply_text };
      setChatHistory(prev => [...prev, newAssistantMessage]);

      // Play audio response
      const audioData = atob(reply_audio);
      const audioBytes = new Uint8Array(audioData.length).map((_, i) => audioData.charCodeAt(i));
      const newAudioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(newAudioBlob);
      const audio = new Audio(audioUrl);
      audio.play();

    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred. Please check the console for details.');
    } finally {
      setAppState('idle');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (appState === 'recording') stopRecording();
    };
  }, [appState]);

  // --- JSX Rendering ---
  
  const getButtonClassName = () => {
    let baseClasses = 'w-20 h-20 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out focus:outline-none focus:ring-4';
    switch (appState) {
        case 'recording': return `${baseClasses} bg-green-500 hover:bg-green-600 focus:ring-green-300`;
        case 'processing': return `${baseClasses} bg-gray-500 cursor-not-allowed`;
        case 'idle':
        default: return `${baseClasses} bg-red-500 hover:bg-red-600 focus:ring-red-300`;
    }
  }
  
  return (
    <div className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl flex flex-col h-full">
        <h1 className="text-4xl font-bold text-center text-cyan-400 mb-4">Voice AI Assistant</h1>
        <div ref={chatContainerRef} className="flex-grow bg-slate-800 rounded-lg p-4 mb-4 h-[60vh] overflow-y-auto flex flex-col gap-4">
          {chatHistory.length === 0 ? (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-slate-400">Press the button and start speaking...</p>
            </div>
          ) : (
            chatHistory.map((msg, index) => (
              <div key={index} className={`p-3 rounded-2xl max-w-[80%] leading-snug ${msg.role === 'user' ? 'bg-blue-600 self-end text-white' : 'bg-slate-700 self-start text-slate-200'}`}>
                {msg.content}
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="h-6 text-slate-400 italic">
            {appState === 'recording' && 'Listening... Stop by pausing or clicking the button.'}
            {appState === 'processing' && 'AI is thinking...'}
            {appState === 'idle' && 'Press the button to speak.'}
          </div>
          <button onClick={handleRecordClick} className={getButtonClassName()} disabled={appState === 'processing'}>
            {appState === 'processing' ? <Spinner /> : appState === 'recording' ? <StopIcon /> : <MicIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;