import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import React from "react";
import { useNavigate } from "react-router";

import { Loader } from "../../theme";
import cn from "../../utils/classnames.ts";
import ChatForm from "./ChatForm.tsx";
import WebLLM from "../../ai/llm/WebLLM.ts";
import useCart from "../../store/provider/cart/useCart.ts";
import { createShoppingTools } from "../../ai/tools/shoppingTools.ts";
import parseXmlFunctionCalls from "../../utils/agent/parseXmlFunctionCalls.ts";
import { PRODUCTS } from "../../store/products.ts";
import type { ToolAction } from "../../utils/agent/tool.ts";
import toolsToSystemPrompt from "../../utils/agent/toolsToSystemPrompt.ts";

// Generate ALL products in compact format: "id: Name ($price)"
const productList = PRODUCTS.map(p => `${p.id}: ${p.name} ($${p.price})`).join("\n");

// 🎯 FIRST CLASS SYSTEM PROMPT: Auto-generates tool docs from tool definitions!
const buildSystemPrompt = (tools: ReturnType<typeof createShoppingTools>) => `
You are a friendly shopping assistant for Emoji Store.

RULES:
- Never use <think> tags or internal reasoning
- Keep responses short (1-2 sentences max)
- ALWAYS use tools - don't just describe what you would do
- Use browseProducts to NAVIGATE to shop page with filters
- Use searchProducts to just LIST products without navigating

AVAILABLE PRODUCTS (use exact productId when adding to cart):
${productList}

VALID COLORS: red, green, blue, yellow, purple, pink, black, white, gray
VALID SIZES: s, m, l, xl, one (for one-size items like bags, beanies, mugs)

${toolsToSystemPrompt(tools)}
`.trim();

// Clean response by removing think tags and other artifacts
const cleanResponse = (text: string): string => {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const Chat: React.FC = () => {
  const [chatOpen, setChatOpen] = React.useState<boolean>(false);

  const [thinking, setThinking] = React.useState<boolean>(false);
  const [response, setResponse] = React.useState<string>("");
  const [modelLoading, setModelLoading] = React.useState<boolean>(false);
  const [modelReady, setModelReady] = React.useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = React.useState<string>("");

  const cart = useCart();
  const navigate = useNavigate(); // 🚀 For navigation actions!
  const webllmRef = React.useRef<WebLLM | null>(null);
  const conversationRef = React.useRef<any>(null);
  const toolsRef = React.useRef<ReturnType<typeof createShoppingTools> | null>(null);

  // 🎯 Handle actions returned by tools
  const handleToolAction = (action: ToolAction) => {
    switch (action.type) {
      case "navigate":
        navigate(action.url);
        break;
      case "openModal":
        // Could implement modal opening here
        console.log("Open modal:", action.modalId);
        break;
      case "scroll":
        const element = document.getElementById(action.elementId);
        element?.scrollIntoView({ behavior: "smooth" });
        break;
    }
  };

  React.useEffect(() => {
    webllmRef.current = new WebLLM();
    toolsRef.current = createShoppingTools(cart);
  }, [cart]);

  const initializeModel = async () => {
    if (modelReady || modelLoading) return;

    setModelLoading(true);
    setLoadingProgress("Initializing model...");

    try {
      if (webllmRef.current && toolsRef.current) {
        // 🎯 FIRST CLASS: Auto-generate system prompt from tool definitions!
        const systemPrompt = buildSystemPrompt(toolsRef.current);
        console.log("📋 Generated System Prompt:\n", systemPrompt); // Debug: see the generated prompt

        conversationRef.current = webllmRef.current.createConversation(systemPrompt);

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

  return (
    <React.Fragment>
      <div
        className={cn(
          "fixed right-4 bottom-24 flex w-md origin-bottom-right flex-col gap-4 rounded-lg border border-purple-400 bg-purple-50 p-6 shadow-xl transition duration-300",
          {
            "translate-x-0 translate-y-16 scale-15 opacity-0": !chatOpen,
          }
        )}
      >
        <h3 className="flex items-center gap-2">
          <SparklesIcon aria-hidden="true" className="size-4" /> Ask the Agent
          {modelReady && <span className="text-xs text-green-600">(Model Ready)</span>}
        </h3>
        
        {!modelReady && !modelLoading && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-sm text-yellow-800 mb-2">Model not loaded yet</p>
            <button
              onClick={initializeModel}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition text-sm"
            >
              Load AI Model
            </button>
          </div>
        )}
        
        {modelLoading && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
            <p className="flex items-center gap-3 text-sm text-blue-800">
              <Loader size={4} /> {loadingProgress || "Loading model..."}
            </p>
            <p className="text-xs text-blue-600 mt-2">This may take a few minutes on first load</p>
          </div>
        )}
        
        {modelReady && (
          <ChatForm
            chatOpen={chatOpen}
            onSubmit={async (prompt) => {
              if (!prompt) {
                setResponse("");
                return;
              }
              setThinking(true);
              setResponse("");

              try {
                if (conversationRef.current && toolsRef.current) {
                  const aiResponse = await conversationRef.current.generate(prompt, 0.7);

                  // Clean the response (remove <think> tags)
                  const cleaned = cleanResponse(aiResponse);

                  // Parse for function calls
                  const { cleanText, functionCalls } = parseXmlFunctionCalls(cleaned);

                  // Execute any function calls
                  if (functionCalls.length > 0) {
                    const results: string[] = [];

                    for (const call of functionCalls) {
                      const tool = toolsRef.current[call.name as keyof typeof toolsRef.current];
                      if (tool && typeof tool.execute === "function") {
                        try {
                          // Cast to any since XML parsing returns generic types
                          const result = await tool.execute(call.parameters as any);
                          results.push(result.nextPrompt);

                          // 🚀 Handle any actions returned by the tool!
                          if (result.action) {
                            handleToolAction(result.action);
                          }
                        } catch (err) {
                          results.push(`Error: couldn't complete ${call.name}`);
                        }
                      }
                    }

                    // Show AI text + tool results
                    const finalResponse = cleanText
                      ? `${cleanText}\n\n${results.join("\n")}`
                      : results.join("\n");
                    setResponse(finalResponse);
                  } else {
                    setResponse(cleanText || cleaned);
                  }
                }
              } catch (error) {
                console.error("Error generating response:", error);
                setResponse("Sorry, I encountered an error. Please try again.");
              } finally {
                setThinking(false);
              }
            }}
          />
        )}
        {(response.length !== 0 || thinking) && (
          <div className="mt-4 max-h-64 overflow-y-auto">
            {thinking ? (
              <p className="flex items-center gap-3 font-light text-gray-500 italic">
                <Loader size={4} /> thinking..
              </p>
            ) : (
              <div className="font-light text-gray-700 text-sm whitespace-pre-wrap">
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

export default Chat;
