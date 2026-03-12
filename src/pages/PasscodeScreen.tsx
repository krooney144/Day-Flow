import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";

const PASSCODE = "1121";

export default function PasscodeScreen() {
  const { authenticate } = useDayFlow();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const handleDigit = (digit: string) => {
    if (code.length >= 4) return;
    const next = code + digit;
    setCode(next);
    setError(false);
    if (next.length === 4) {
      if (next === PASSCODE) {
        setTimeout(() => authenticate(), 200);
      } else {
        setTimeout(() => {
          setError(true);
          setCode("");
        }, 300);
      }
    }
  };

  const handleDelete = () => {
    setCode((c) => c.slice(0, -1));
    setError(false);
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        className="flex flex-col items-center gap-10"
      >
        <div className="text-center">
          <h1 className="text-display text-3xl text-foreground">DayFlow</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter passcode</p>
        </div>

        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: code.length > i ? 1 : 0.85,
                backgroundColor:
                  error
                    ? "hsl(0, 60%, 55%)"
                    : code.length > i
                    ? "hsl(340, 60%, 65%)"
                    : "hsl(220, 20%, 90%)",
              }}
              transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
              className="h-3.5 w-3.5 rounded-full"
            />
          ))}
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-destructive -mt-6"
          >
            Incorrect passcode
          </motion.p>
        )}

        <div className="grid grid-cols-3 gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map(
            (key) => {
              if (key === "") return <div key="empty" />;
              if (key === "del") {
                return (
                  <button
                    key="del"
                    onClick={handleDelete}
                    className="tap-target flex items-center justify-center rounded-2xl text-sm text-muted-foreground transition-colors active:bg-secondary"
                  >
                    Delete
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => handleDigit(key)}
                  className="tap-target flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-medium text-foreground transition-colors active:bg-secondary"
                >
                  {key}
                </button>
              );
            }
          )}
        </div>
      </motion.div>
    </div>
  );
}
