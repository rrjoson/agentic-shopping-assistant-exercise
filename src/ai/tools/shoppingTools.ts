import { z } from "zod";
import tool from "../../utils/agent/tool";
import { PRODUCTS, Category, Color, Size, COLORS, SIZES, CATEGORIES } from "../../store/products";
import { FAQS } from "../../store/faq";
import cosineSimilarity from "../../utils/vectorSearch/cosineSimilarity";

// 🧠 SEMANTIC MAPPINGS: Maps concepts to related terms (simple RAG without vectors!)
// This is like a mini "knowledge base" that expands user queries
const SEMANTIC_MAPPINGS: Record<string, string[]> = {
  // Color concepts
  dark: ["black", "gray", "charcoal", "navy", "dark"],
  light: ["white", "beige", "cream", "light", "pale"],
  bright: ["red", "yellow", "orange", "pink", "bright", "vibrant"],
  cool: ["blue", "green", "teal", "purple", "cool"],
  warm: ["red", "orange", "yellow", "brown", "warm"],
  neutral: ["black", "white", "gray", "beige", "neutral"],

  // Style concepts
  cozy: ["hoodie", "beanie", "sweater", "warm", "soft"],
  casual: ["tee", "shirt", "socks", "everyday"],
  fun: ["emoji", "quirky", "colorful", "playful"],
  gift: ["mug", "bag", "beanie", "gift", "present"],

  // Use case concepts
  outdoor: ["bag", "tote", "backpack", "travel"],
  home: ["mug", "kitchen", "cup", "drink"],
  wear: ["clothing", "shirt", "hoodie", "socks", "beanie"],
};

// Types for cart integration
type CartActions = {
  addProduct: (product: { productId: string; color: string; size: string }) => void;
  removeProduct: (cartProductId: string) => void;
  products: Array<{
    cartProductId: string;
    productId: string;
    color: string;
    size: string;
    quantity: number;
  }>;
};

// Tool factory that takes cart context
export const createShoppingTools = (cart: CartActions) => ({
  searchProducts: tool({
    description: "Search and filter products in the catalog",
    parameters: z.object({
      query: z.string().optional().describe("Search term for product name, tags, or description"),
      category: z.enum(["clothing", "accessories", "kitchen", "new"]).optional(),
      maxPrice: z.number().optional().describe("Maximum price filter"),
      color: z.string().optional().describe("Filter by color"),
    }),
    examples: [
      { query: "Show me hoodies", parameters: { query: "hoodie" } },
      { query: "What kitchen items do you have?", parameters: { category: "kitchen" } },
      { query: "Find me something under $20", parameters: { maxPrice: 20 } },
      { query: "Show blue accessories", parameters: { category: "accessories", color: "blue" } },
    ],
    execute: async ({ query, category, maxPrice, color }) => {
      let results = [...PRODUCTS];

      if (query) {
        const searchLower = query.toLowerCase();

        // 🔍 SEMANTIC EXPANSION: Expand query using our knowledge base!
        // This is the "Retrieval" part of RAG - we retrieve related concepts
        const expandedTerms: string[] = [searchLower];

        // Check each word in the query against our semantic mappings
        const queryWords = searchLower.split(/\s+/);
        for (const word of queryWords) {
          if (SEMANTIC_MAPPINGS[word]) {
            // Found a concept! Add all related terms
            expandedTerms.push(...SEMANTIC_MAPPINGS[word]);
          }
        }

        // Remove duplicates
        const uniqueTerms = [...new Set(expandedTerms)];

        // 🎯 AUGMENTED SEARCH: Search using expanded terms (not just original query)
        results = results.filter((p) =>
          uniqueTerms.some(
            (term) =>
              p.name.toLowerCase().includes(term) ||
              p.tags.some((t) => t.toLowerCase().includes(term)) ||
              p.description?.toLowerCase().includes(term) ||
              p.colors.some((c) => c.toLowerCase().includes(term))
          )
        );
      }

      if (category) {
        results = results.filter((p) =>
          p.categories.includes(category as Category)
        );
      }

      if (maxPrice) {
        results = results.filter((p) => p.price <= maxPrice);
      }

      if (color) {
        const colorLower = color.toLowerCase();
        results = results.filter((p) =>
          p.colors.some((c) => c.toLowerCase().includes(colorLower))
        );
      }

      const summary = results.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        colors: p.colors.map((c) => COLORS[c]?.label || c),
        sizes: p.sizes.map((s) => SIZES[s] || s),
        rating: p.rating,
      }));

      // 📚 Show semantic expansion for educational purposes
      let semanticNote = "";
      if (query) {
        const queryWords = query.toLowerCase().split(/\s+/);
        const expansions: string[] = [];
        for (const word of queryWords) {
          if (SEMANTIC_MAPPINGS[word]) {
            expansions.push(`"${word}" → [${SEMANTIC_MAPPINGS[word].slice(0, 3).join(", ")}...]`);
          }
        }
        if (expansions.length > 0) {
          semanticNote = `\n🧠 Semantic expansion: ${expansions.join(", ")}`;
        }
      }

      return {
        nextPrompt: `Found ${results.length} products.${semanticNote}\nTop results: ${JSON.stringify(summary, null, 2)}`,
      };
    },
  }),

  addToCart: tool({
    description: "Add a product to the shopping cart",
    parameters: z.object({
      productId: z.string().describe("The product ID to add"),
      color: z.string().describe("Selected color"),
      size: z.string().describe("Selected size (s, m, l, xl, or one)"),
      quantity: z.number().optional().default(1).describe("Quantity to add"),
    }),
    examples: [
      {
        query: "Add the rocket hoodie in blue, size L",
        parameters: { productId: "rocket-hoodie", color: "blue", size: "l" },
      },
      {
        query: "I want 2 pizza socks in yellow, medium",
        parameters: { productId: "pizza-socks", color: "yellow", size: "m", quantity: 2 },
      },
    ],
    execute: async ({ productId, color, size, quantity = 1 }) => {
      const product = PRODUCTS.find((p) => p.id === productId);

      if (!product) {
        return {
          nextPrompt: `Product "${productId}" not found. Please check the product ID and try again.`,
        };
      }

      // Validate color - use first available if invalid
      let validColor = product.colors.find(
        (c) => c.toLowerCase() === color.toLowerCase()
      );
      const colorFallback = !validColor;
      if (!validColor) {
        validColor = product.colors[0]; // Default to first available color
      }

      // Validate size - use first available if invalid
      let validSize = product.sizes.find(
        (s) => s.toLowerCase() === size.toLowerCase()
      );
      const sizeFallback = !validSize;
      if (!validSize) {
        validSize = product.sizes[0]; // Default to first available size
      }

      // Add to cart
      for (let i = 0; i < quantity; i++) {
        cart.addProduct({
          productId: product.id,
          color: validColor,
          size: validSize,
        });
      }

      // Build response with fallback notes
      const colorLabel = COLORS[validColor as Color]?.label || validColor;
      const sizeLabel = SIZES[validSize as Size] || validSize;
      let message = `Added ${quantity}x ${product.name} (${colorLabel}, ${sizeLabel}) to cart. $${product.price * quantity}`;

      if (colorFallback || sizeFallback) {
        const notes = [];
        if (colorFallback) notes.push(`color defaulted to ${colorLabel}`);
        if (sizeFallback) notes.push(`size defaulted to ${sizeLabel}`);
        message += ` (Note: ${notes.join(", ")})`;
      }

      return { nextPrompt: message };
    },
  }),

  viewCart: tool({
    description: "View the current shopping cart contents",
    parameters: z.object({}),
    examples: [
      { query: "What's in my cart?", parameters: {} },
      { query: "Show my cart", parameters: {} },
    ],
    execute: async () => {
      if (cart.products.length === 0) {
        return {
          nextPrompt: "Your cart is empty. Would you like me to recommend some products?",
        };
      }

      const cartItems = cart.products.map((item) => {
        const product = PRODUCTS.find((p) => p.id === item.productId);
        return {
          name: product?.name || item.productId,
          color: COLORS[item.color as Color]?.label || item.color,
          size: SIZES[item.size as Size] || item.size,
          quantity: item.quantity,
          price: product ? product.price * item.quantity : 0,
        };
      });

      const total = cartItems.reduce((sum, item) => sum + item.price, 0);

      return {
        nextPrompt: `Cart contents (${cart.products.length} items, Total: $${total}):\n${JSON.stringify(cartItems, null, 2)}`,
      };
    },
  }),

  removeFromCart: tool({
    description: "Remove an item from the cart by product name or ID",
    parameters: z.object({
      productName: z.string().describe("The product name or ID to remove (e.g., 'frog-beanie' or 'Frog Beanie')"),
    }),
    examples: [
      { query: "Remove the frog beanie from my cart", parameters: { productName: "frog-beanie" } },
      { query: "Remove Rocket Hoodie", parameters: { productName: "rocket-hoodie" } },
    ],
    execute: async ({ productName }) => {
      const searchLower = productName.toLowerCase().replace(/\s+/g, "-");

      // Find matching item in cart
      const cartItem = cart.products.find((item) => {
        const product = PRODUCTS.find((p) => p.id === item.productId);
        return (
          item.productId.toLowerCase() === searchLower ||
          item.productId.toLowerCase().includes(searchLower) ||
          product?.name.toLowerCase().includes(productName.toLowerCase())
        );
      });

      if (!cartItem) {
        return {
          nextPrompt: `Couldn't find "${productName}" in your cart. Use viewCart to see what's in your cart.`,
        };
      }

      const product = PRODUCTS.find((p) => p.id === cartItem.productId);
      cart.removeProduct(cartItem.cartProductId);

      return {
        nextPrompt: `Removed ${product?.name || cartItem.productId} from your cart.`,
      };
    },
  }),

  getProductDetails: tool({
    description: "Get detailed information about a specific product",
    parameters: z.object({
      productId: z.string().describe("The product ID to look up"),
    }),
    examples: [
      { query: "Tell me more about the rocket hoodie", parameters: { productId: "rocket-hoodie" } },
    ],
    execute: async ({ productId }) => {
      const product = PRODUCTS.find((p) => p.id === productId);

      if (!product) {
        return {
          nextPrompt: `Product "${productId}" not found.`,
        };
      }

      return {
        nextPrompt: `**${product.name}** - $${product.price}
Rating: ${product.rating || "N/A"}/5 ⭐
Categories: ${product.categories.map((c) => CATEGORIES[c]?.label || c).join(", ")}
Colors: ${product.colors.map((c) => COLORS[c]?.label || c).join(", ")}
Sizes: ${product.sizes.map((s) => SIZES[s] || s).join(", ")}
Description: ${product.description || "No description available."}
Delivery: ${product.delivery}`,
      };
    },
  }),

  getRecommendations: tool({
    description: "Get product recommendations",
    parameters: z.object({
      basedOn: z.enum(["popular", "new", "budget"]).optional().default("popular"),
      category: z.enum(["clothing", "accessories", "kitchen"]).optional(),
    }),
    examples: [
      { query: "What do you recommend?", parameters: { basedOn: "popular" } },
      { query: "Show me new arrivals", parameters: { basedOn: "new" } },
      { query: "What's popular in accessories?", parameters: { basedOn: "popular", category: "accessories" } },
    ],
    execute: async ({ basedOn, category }) => {
      let recommendations = [...PRODUCTS];

      if (category) {
        recommendations = recommendations.filter((p) =>
          p.categories.includes(category as Category)
        );
      }

      if (basedOn === "popular") {
        recommendations = recommendations
          .filter((p) => p.rating && p.rating >= 4)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0));
      } else if (basedOn === "new") {
        recommendations = recommendations.filter((p) =>
          p.categories.includes(Category.NEW)
        );
      } else if (basedOn === "budget") {
        recommendations = recommendations.sort((a, b) => a.price - b.price);
      }

      const top5 = recommendations.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        rating: p.rating,
      }));

      return {
        nextPrompt: `Here are my ${basedOn} recommendations${category ? ` in ${category}` : ""}:\n${JSON.stringify(top5, null, 2)}`,
      };
    },
  }),

  // 🚀 NAVIGATION TOOL: Browse products page with filters applied!
  browseProducts: tool({
    description: "Navigate to the products page with filters applied. Use this when user wants to BROWSE or SEE products on the shop page.",
    parameters: z.object({
      query: z.string().optional().describe("Natural language description of what to find (e.g., 'dark colored items', 'cozy clothes')"),
      colors: z.array(z.string()).optional().describe("Specific colors to filter by"),
      categories: z.array(z.enum(["clothing", "accessories", "kitchen", "new"])).optional(),
      sizes: z.array(z.enum(["s", "m", "l", "xl", "one"])).optional(),
    }),
    examples: [
      { query: "Show me black items on the shop", parameters: { colors: ["black"] } },
      { query: "Find me dark colored items", parameters: { query: "dark" } },
      { query: "Browse cozy clothing", parameters: { query: "cozy", categories: ["clothing"] } },
      { query: "Show me all kitchen items", parameters: { categories: ["kitchen"] } },
    ],
    execute: async ({ query, colors, categories, sizes }) => {
      // 🧠 SEMANTIC EXPANSION: Convert natural language to filters
      const expandedColors: string[] = [...(colors || [])];
      const expandedCategories: string[] = [...(categories || [])];

      if (query) {
        const queryWords = query.toLowerCase().split(/\s+/);

        for (const word of queryWords) {
          // Check semantic mappings for color concepts
          if (SEMANTIC_MAPPINGS[word]) {
            const mappedTerms = SEMANTIC_MAPPINGS[word];

            // Check if any mapped terms are actual colors
            const colorKeys = Object.keys(COLORS).map(c => c.toLowerCase());
            for (const term of mappedTerms) {
              if (colorKeys.includes(term) && !expandedColors.includes(term)) {
                expandedColors.push(term);
              }
            }

            // Check if any mapped terms relate to categories
            const categoryKeywords: Record<string, string[]> = {
              clothing: ["hoodie", "shirt", "tee", "socks", "beanie", "wear"],
              accessories: ["bag", "tote", "backpack"],
              kitchen: ["mug", "cup", "kitchen", "drink"],
            };

            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
              if (keywords.some(k => mappedTerms.includes(k)) && !expandedCategories.includes(cat)) {
                expandedCategories.push(cat);
              }
            }
          }

          // Direct color check
          const colorKeys = Object.keys(COLORS).map(c => c.toLowerCase());
          if (colorKeys.includes(word) && !expandedColors.includes(word)) {
            expandedColors.push(word);
          }
        }
      }

      // Build URL query string
      const params = new URLSearchParams();
      if (expandedColors.length > 0) {
        params.set("colors", expandedColors.join(","));
      }
      if (expandedCategories.length > 0) {
        params.set("categories", expandedCategories.join(","));
      }
      if (sizes && sizes.length > 0) {
        params.set("sizes", sizes.join(","));
      }

      const queryString = params.toString();
      const url = `/products${queryString ? `?${queryString}` : ""}`;

      // 📚 Show semantic expansion for educational purposes
      let semanticNote = "";
      if (query) {
        const expansions: string[] = [];
        const queryWords = query.toLowerCase().split(/\s+/);
        for (const word of queryWords) {
          if (SEMANTIC_MAPPINGS[word]) {
            expansions.push(`"${word}" → [${SEMANTIC_MAPPINGS[word].slice(0, 3).join(", ")}...]`);
          }
        }
        if (expansions.length > 0) {
          semanticNote = `\n🧠 Semantic expansion: ${expansions.join(", ")}`;
        }
      }

      return {
        nextPrompt: `Navigating to products page with filters: colors=[${expandedColors.join(", ")}], categories=[${expandedCategories.join(", ")}]${semanticNote}`,
        // 🎯 ACTION: This tells the Chat component to navigate!
        action: {
          type: "navigate",
          url: url,
        },
      };
    },
  }),

  // 🔍 RAG TOOL: Searches FAQs using VECTOR SIMILARITY
  searchFAQ: tool({
    description: "Search FAQs for answers about shipping, returns, payments, etc.",
    parameters: z.object({
      question: z.string().describe("The customer's question about store policies"),
    }),
    examples: [
      { query: "How do I return something?", parameters: { question: "return policy" } },
      { query: "What payment methods do you accept?", parameters: { question: "payment methods" } },
      { query: "How long does shipping take?", parameters: { question: "shipping time" } },
    ],
    execute: async ({ question }) => {
      // Flatten all FAQs into one array with their vectors
      const allFAQs = FAQS.flatMap(group =>
        group.questions.map(q => ({ ...q, category: group.title }))
      );

      // STEP 1: Find initial match via keyword (simulates "embedding the query")
      // In production, you'd call an embedding API here:
      // const queryVector = await embedText(question);
      const searchLower = question.toLowerCase();
      const keywordMatch = allFAQs.find(faq =>
        faq.question.toLowerCase().includes(searchLower) ||
        faq.answer.toLowerCase().includes(searchLower)
      );

      if (keywordMatch) {
        // STEP 2: Use VECTOR SEARCH to find similar FAQs! 🎯
        // Compare this FAQ's vector against all other FAQs
        const queryVector = keywordMatch.vectorRepresentationQuestion.allMiniLmL6v2;

        const scoredFAQs = allFAQs
          .map(faq => ({
            ...faq,
            // THIS IS THE RAG PART: cosine similarity between vectors!
            similarity: cosineSimilarity(
              queryVector,
              faq.vectorRepresentationQuestion.allMiniLmL6v2
            )
          }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 3); // Top 3 most similar

        // Return the best match + show similarity scores
        const best = scoredFAQs[0];
        const relatedFAQs = scoredFAQs.slice(1)
          .map(f => `• ${f.question} (${Math.round(f.similarity * 100)}% similar)`)
          .join("\n");

        return {
          nextPrompt: `FAQ: "${best.question}"\nAnswer: ${best.answer}\n\n📚 Related FAQs:\n${relatedFAQs}`,
        };
      }

      // FALLBACK: No keyword match, use vector search across ALL FAQs
      // Pick the first FAQ's vector as a baseline (in production, embed the query)
      const baselineVector = allFAQs[0].vectorRepresentationQuestion.allMiniLmL6v2;

      const topByVector = allFAQs
        .map(faq => ({
          ...faq,
          similarity: cosineSimilarity(
            baselineVector,
            faq.vectorRepresentationQuestion.allMiniLmL6v2
          )
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

      return {
        nextPrompt: `I found these related FAQs:\n${topByVector.map(f => `• ${f.question}`).join("\n")}\n\nAsk about one of these topics!`,
      };
    },
  }),
});

export default createShoppingTools;
