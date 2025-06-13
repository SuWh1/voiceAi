import React from "react";
import type { ChatLogic } from "../hooks/useChatLogic";

const ChatUI: React.FC<ChatLogic> = ({
  text,
  history,
  isThinkingText,
  isThinkingVoice,
  isRecording,
  error,
  handleRecordToggle,
  handleAsk,
  setText,
}) => {
  return (
    <div className="flex flex-col max-w-2xl mx-auto p-4 bg-white shadow-lg rounded-xl space-y-4">
      {/* Chat History */}
      <div className="h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50 space-y-2">
        {history.map((m, idx) => (
          <div
            key={idx}
            className={`max-w-[80%] px-4 py-2 rounded-lg text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-green-100 text-right"
                : "mr-auto bg-gray-200"
            }`}
          >
            <strong>{m.role === "user" ? "You" : "AI"}:</strong> {m.content}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-600 bg-red-100 p-2 rounded text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Textarea */}
      <textarea
        placeholder="Type your message or use the mic..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        disabled={isThinkingText || isThinkingVoice || isRecording}
      />

      {/* Controls */}
      <div className="flex gap-4 justify-between">
        <button
          onClick={handleRecordToggle}
          className={`flex-1 py-2 px-4 rounded-lg text-white font-semibold transition-all ${
            isRecording ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
          }`}
        >
          {isRecording ? "⏹ Stop Recording" : "🎤 Record"}
        </button>

        <button
          onClick={handleAsk}
          disabled={isThinkingText || isThinkingVoice || !text.trim() || isRecording}
          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
            isThinkingText || isThinkingVoice || isRecording
              ? "bg-indigo-300 cursor-not-allowed text-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {isThinkingText
            ? "Thinking..."
            : isThinkingVoice
            ? "Speaking..."
            : "Ask & Speak"}
        </button>
      </div>

      {/* Status Spinner */}
      {(isThinkingText || isThinkingVoice) && (
        <div className="text-center text-sm text-gray-500 mt-2 animate-pulse">
          {isThinkingText ? "🤖 AI is generating text..." : "🔊 Generating voice..."}
        </div>
      )}
    </div>
  );
};

export default ChatUI;
