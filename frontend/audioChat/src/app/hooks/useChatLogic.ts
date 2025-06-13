
import { useState, useRef, useEffect } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatLogic {
  text: string;
  history: Message[];
  isThinkingText: boolean;
  isThinkingVoice: boolean;
  isRecording: boolean;
  error: string | null;
  handleRecordToggle: () => void;
  handleAsk: () => void;
  setText: React.Dispatch<React.SetStateAction<string>>;
}

const BACKEND_URL = "http://localhost:8000";
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION = 1500;

const useChatLogic = (): ChatLogic => {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Message[]>([]);
  const [isThinkingText, setIsThinkingText] = useState(false);
  const [isThinkingVoice, setIsThinkingVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<number>(0);

  const cleanupAudioContext = () => {
    if (analyserRef.current) analyserRef.current.disconnect();
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    analyserRef.current = null;
    sourceNodeRef.current = null;
    audioContextRef.current = null;
    silenceTimerRef.current = null;
  };

  const startSilenceDetection = (stream: MediaStream) => {
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNodeRef.current = sourceNode;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    sourceNode.connect(analyser);

    const dataArray = new Float32Array(analyser.fftSize);
    lastSoundTimeRef.current = performance.now();

    const checkSilence = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) sumSquares += dataArray[i] ** 2;
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const now = performance.now();
      if (rms > SILENCE_THRESHOLD) {
        lastSoundTimeRef.current = now;
      } else if (now - lastSoundTimeRef.current > SILENCE_DURATION) {
        stopRecording();
        return;
      }
      silenceTimerRef.current = window.setTimeout(checkSilence, 200);
    };
    checkSilence();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    cleanupAudioContext();
    setIsRecording(false);
  };

  const handleAsk = () => {
    if (!text.trim()) return;
    askWithMessage(text.trim());
  };

  const askWithMessage = async (userMsg: string) => {
    setError(null);
    const newHistory = [...history, { role: "user" as const, content: userMsg }];
    setHistory(newHistory);
    setText("");

    setIsThinkingText(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat-text/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMsg, history: newHistory, voice: "nova" }),
      });
      const data = await res.json();
      const replyText = data.reply;
      setHistory((prev) => [...prev, { role: "assistant", content: replyText }]);
    } catch (e) {
      setError("Error fetching text response");
    } finally {
      setIsThinkingText(false);
    }

    setIsThinkingVoice(true);
    try {
      const res = await fetch(`${BACKEND_URL}/chat-voice/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMsg, history: newHistory, voice: "nova" }),
      });
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsThinkingVoice(false);
      audio.play();
    } catch (e) {
      setError("Error fetching voice response");
      setIsThinkingVoice(false);
    }
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      try {
        setError(null);
        setIsRecording(true);
        chunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startSilenceDetection(stream);
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          cleanupAudioContext();
          setIsRecording(false);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("file", blob, "voice.webm");
          try {
            const res = await fetch(`${BACKEND_URL}/transcribe/`, {
              method: "POST",
              body: formData,
            });
            const data = await res.json();
            if (data.transcript) {
              setText(data.transcript);
              await askWithMessage(data.transcript);
            } else {
              throw new Error("No transcript found");
            }
          } catch {
            setError("Error transcribing audio");
          }
        };

        mediaRecorder.start();
      } catch {
        setError("Cannot access microphone");
        setIsRecording(false);
        cleanupAudioContext();
      }
    }
  };

  useEffect(() => {
    return () => {
      if (isRecording) stopRecording();
    };
  }, [isRecording]);

  return {
    text,
    setText,
    history,
    isThinkingText,
    isThinkingVoice,
    isRecording,
    error,
    handleRecordToggle,
    handleAsk,
  };
};

export default useChatLogic;
