import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import React from "react";

import { Loader } from "../../theme";
import cn from "../../utils/classnames";
import ChatForm from "./ChatForm";
import WebLLM from "../../ai/llm/WebLLM";
import useCart from "../../store/provider/cart/useCart";
import { createShoppingTools } from "../../ai/tools/shoppingTools";
import toolsToSystemPrompt from "../../utils/agent/toolsToSystemPrompt";
import parseXmlFunctionCalls from "../../utils/agent/parseXmlFunctionCalls";
import SHOPPING_ASSISTANT_PROMPT from "../../ai/prompts/shoppingAssistant";

const AgentChat: React.FC = () => {
  const [chatOpen, setChatOpen] = React.useState<boolean>(false);
  const [thinking, setThinking] = React.useState<boolean>(false);
  const [response, setResponse] = React.useState<string>("");
  const [modelLoading, setModelLoading] = React.useState<boolean>(false);
  const [modelReady, setModelReady] = React.useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = React.useState<string>("");

  const cart = useCart();
  const webllmRef = React.useRef<WebLLM | null>(null);
  const conversationRef = React.useRef<any>(null);
  const toolsRef = React.useRef<ReturnType<typeof createShoppingTools> | null>(null);

  React.useEffect(() => {
    webllmRef.current = new WebLLM();
    // Create tools with cart context
    toolsRef.current = createShoppingTools(cart);
  }, [cart]);

  const initializeModel = async () => {
    if (modelReady || modelLoading) return;

    setModelLoading(true);
    setLoadingProgress("Initializing model...");

    try {
      if (webllmRef.current && toolsRef.current) {
        // Build full system prompt with tools
        const toolsPrompt = toolsToSystemPrompt(toolsRef.current);
        const fullSystemPrompt = `${SHOPPING_ASSISTANT_PROMPT}\n\n${toolsPrompt}`;

        conversationRef.current = webllmRef.current.createConversation(fullSystemPrompt);

        setModelReady(true);
        setLoadingProgress("");
      }
    } catch (error) {
      console.error("Error loading model:", error);
      setLoadingProgress("Error loading model. Please try again.");
    } finally {
      setModelLoading(false);
    }
  };

  const handleSubmit = async (prompt: string) => {
    if (!prompt) {
      setResponse("");
      return;
    }
    setThinking(true);
    setResponse("");

    try {
      if (conversationRef.current && toolsRef.current) {
        // Get AI response
        let aiResponse = await conversationRef.current.generate(prompt, 0.7);

        // Parse for function calls
        const { cleanText, functionCalls } = parseXmlFunctionCalls(aiResponse);

        // Execute any function calls
        if (functionCalls.length > 0) {
          const results: string[] = [];

          for (const call of functionCalls) {
            const tool = toolsRef.current[call.name as keyof typeof toolsRef.current];
            if (tool && typeof tool.execute === "function") {
              try {
                // Cast to any since XML parsing returns generic types
                const result = await tool.execute(call.parameters as any);
                results.push(`[${call.name}]: ${result.nextPrompt}`);
              } catch (err) {
                results.push(`[${call.name}]: Error executing tool`);
              }
            }
          }

          // If there were function calls, show the clean text + results
          const finalResponse = cleanText
            ? `${cleanText}\n\n${results.join("\n")}`
            : results.join("\n");
          setResponse(finalResponse);
        } else {
          setResponse(cleanText || aiResponse);
        }
      }
    } catch (error) {
      console.error("Error generating response:", error);
      setResponse("Sorry, I encountered an error. Please try again.");
    } finally {
      setThinking(false);
    }
  };

  return (
    <React.Fragment>
      <div
        className={cn(
          "fixed right-4 bottom-24 flex w-md max-w-[calc(100vw-2rem)] origin-bottom-right flex-col gap-4 rounded-lg border border-purple-400 bg-purple-50 p-6 shadow-xl transition duration-300",
          {
            "translate-x-0 translate-y-16 scale-15 opacity-0": !chatOpen,
          }
        )}
      >
        <h3 className="flex items-center gap-2">
          <SparklesIcon aria-hidden="true" className="size-4" /> Shopping Assistant
          {modelReady && <span className="text-xs text-green-600">(Ready)</span>}
        </h3>

        {!modelReady && !modelLoading && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-sm text-yellow-800 mb-2">AI Assistant not loaded</p>
            <button
              onClick={initializeModel}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition text-sm"
            >
              Load Shopping Assistant
            </button>
            <p className="text-xs text-yellow-600 mt-2">
              I can search products, add to cart, and help you shop!
            </p>
          </div>
        )}

        {modelLoading && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
            <p className="flex items-center gap-3 text-sm text-blue-800">
              <Loader size={4} /> {loadingProgress || "Loading model..."}
            </p>
            <p className="text-xs text-blue-600 mt-2">
              This may take a few minutes on first load
            </p>
          </div>
        )}

        {modelReady && (
          <ChatForm chatOpen={chatOpen} onSubmit={handleSubmit} />
        )}

        {(response.length !== 0 || thinking) && (
          <div className="mt-4 max-h-64 overflow-y-auto">
            {thinking ? (
              <p className="flex items-center gap-3 font-light text-gray-500 italic">
                <Loader size={4} /> thinking..
              </p>
            ) : (
              <div className="font-light text-gray-700 whitespace-pre-wrap text-sm">
                {response}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => setChatOpen((open) => !open)}
        className="fixed right-4 bottom-4 grid cursor-pointer rounded-full bg-purple-900 p-3 text-white outline-2 outline-offset-4 outline-purple-300 transition hover:outline-4 hover:outline-purple-900 focus:outline-4 focus:outline-purple-900"
      >
        <XMarkIcon
          aria-hidden="true"
          className={cn("col-start-1 row-start-1 size-8 transition", {
            "rotate-90 opacity-0": !chatOpen,
          })}
        />
        <SparklesIcon
          aria-hidden="true"
          className={cn("col-start-1 row-start-1 size-8 transition", {
            "-rotate-90 opacity-0": chatOpen,
          })}
        />
      </button>
    </React.Fragment>
  );
};

export default AgentChat;
