import ChatBox from "./components/ChatUI";
import useChatLogic from "./hooks/useChatLogic";

const App = () => {
  return (
    <div className="min-h-screen bg-gray-100 p-8 text-center">
      <h1 className="text-3xl font-bold mb-6 text-purple-700">🎤 Voice-to-Voice Assistant</h1>
      <ChatBox {...useChatLogic()} />
    </div>
  );
};

export default App;
