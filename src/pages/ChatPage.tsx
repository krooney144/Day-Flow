import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { ChatMessage } from "@/types/dayflow";
import { Send, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { callPlannerAI, executeToolCalls } from "@/lib/planner-ai";
import { toast } from "sonner";

export default function ChatPage() {
  const store = useDayFlow();
  const { chatMessages, addChatMessage, clearChat, tasks, preferences, timeBlocks, customProjects } = store;
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const processMessage = async (content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    addChatMessage(userMsg);
    setInput("");
    setIsTyping(true);

    // Build conversation history for AI (last 20 messages for context window)
    const history = [...chatMessages, userMsg]
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await callPlannerAI({
        messages: history,
        currentTasks: tasks,
        preferences,
        timeBlocks,
        customProjects,
      });

      // Execute any tool calls
      let actionSummary = "";
      if (response.toolCalls.length > 0) {
        const summaries = executeToolCalls(response.toolCalls, store, timeBlocks, tasks);
        if (summaries.length > 0) {
          actionSummary = "\n\n---\n✓ " + summaries.join(" · ");
        }
      }

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: (response.content || "Done!") + actionSummary,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(aiMsg);
    } catch (err: unknown) {
      console.error("Planner AI error:", err);
      const message = err instanceof Error ? err.message : "Something went wrong with the AI planner.";
      toast.error(message);

      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      };
      addChatMessage(errorMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const send = () => {
    if (!input.trim() || isTyping) return;
    processMessage(input.trim());
  };

  const greeting = chatMessages.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-display text-xl text-foreground">Planner</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Tell me everything — I'll turn it into a plan</p>
        </div>
        {chatMessages.length > 0 && (
          <button
            aria-label="New conversation"
            onClick={clearChat}
            className="tap-target flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground active:bg-secondary transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
        {greeting && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="mt-8 mb-6"
          >
            <div className="surface-card p-4">
              <p className="text-sm text-foreground font-medium mb-2">Good {getTimeOfDay()}.</p>
              <p className="text-sm text-secondary-foreground leading-relaxed">
                Just brain dump everything on your mind — tasks, meetings, errands, reminders. I'll sort them out and help you build a realistic plan.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {[
                "I need to study for my exam, do laundry, call the dentist, and buy groceries",
                "Help me plan today",
                "I'm feeling overwhelmed",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => processMessage(s)}
                  className="rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground active:bg-border transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <div className="space-y-3">
          <AnimatePresence>
            {chatMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary text-secondary-foreground rounded-bl-md"
                  }`}
                >
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none [&_p]:m-0 [&_ul]:mt-1 [&_ol]:mt-1 [&_li]:text-sm">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="px-4 pb-24 pt-2">
        <div className="flex items-end gap-2 rounded-2xl bg-secondary p-1.5 pl-4">
          <textarea
            ref={textareaRef}
            aria-label="Message to planner"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Brain dump everything here..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none py-2 leading-relaxed"
            style={{ maxHeight: 160 }}
          />
          <button
            aria-label="Send message"
            onClick={send}
            disabled={!input.trim() || isTyping}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Send className="h-4 w-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
