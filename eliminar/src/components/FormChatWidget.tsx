import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, X, Send, Loader2, Bot, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { FormLocaleSwitcher, readStoredFormLocale } from "@/components/forms/FormLocaleSwitcher";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface FormChatWidgetProps {
  formId: string;
  primaryColor?: string;
  title?: string;
  welcomeMessage?: string;
}

export function FormChatWidget({ 
  formId, 
  primaryColor = "#7c3aed",
  title = "Assistente Virtual",
  welcomeMessage = "Olá! 👋 Posso ajudá-lo a preencher o formulário de forma rápida. Quer começar?"
}: FormChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formConfig, setFormConfig] = useState<any>(null);
  const [collectedData, setCollectedData] = useState<Record<string, any>>({});
  const [currentFieldIndex, setCurrentFieldIndex] = useState(-1);
  const [isComplete, setIsComplete] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const addAssistantMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: "assistant",
      content
    }]);
  };

  const loadFormConfig = useCallback(async (langOverride?: string | null) => {
    try {
      // Append detected (or explicitly requested) locale so server can resolve translations
      let lang: string | null = null;
      if (typeof langOverride !== "undefined") {
        lang = langOverride;
      } else {
        const stored = readStoredFormLocale();
        if (stored) {
          lang = stored;
        } else {
          const { detectLocale } = await import("@/lib/formLocales");
          lang = detectLocale();
        }
      }
      const langSuffix = lang ? `&lang=${encodeURIComponent(lang)}` : "";
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-form-data?form_id=${formId}${langSuffix}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setFormConfig(data);
      setCurrentLocale(data.resolved_locale || data.default_locale || lang || null);
      
      // Add welcome message
      addAssistantMessage(welcomeMessage);
    } catch (error) {
      console.error("Error loading form config:", error);
      addAssistantMessage("Desculpe, ocorreu um erro ao carregar o formulário. Por favor, tente novamente mais tarde.");
    }
  }, [formId, SUPABASE_URL, welcomeMessage]);

  // Load form configuration
  useEffect(() => {
    if (isOpen && !formConfig) {
      loadFormConfig();
    }
  }, [isOpen, formId, loadFormConfig]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: "user",
      content
    }]);
  };

  const getAllFields = () => {
    if (!formConfig?.steps) return [];
    return formConfig.steps.flatMap((step: any) => step.fields || []);
  };

  const startFormCollection = () => {
    setCurrentFieldIndex(0);
    askForField(0);
  };

  const askForField = (index: number) => {
    const fields = getAllFields();
    if (index >= fields.length) {
      // All fields collected, submit
      submitForm();
      return;
    }

    const field = fields[index];
    let question = `${field.field_label}`;
    
    // Add options if it's a select field
    if (field.field_type === 'select' && field.options?.options) {
      const options = field.options.options.join(", ");
      question += `\n\nOpções: ${options}`;
    }
    
    // Add placeholder hint
    if (field.placeholder) {
      question += `\n(Ex: ${field.placeholder})`;
    }

    if (field.is_required) {
      question += " *";
    }

    addAssistantMessage(question);
  };

  const validateField = (field: any, value: string): { valid: boolean; error?: string } => {
    if (field.is_required && !value.trim()) {
      return { valid: false, error: "Este campo é obrigatório." };
    }

    if (field.field_type === 'email' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, error: "Por favor, insira um email válido." };
      }
    }

    if (field.field_type === 'phone' && value) {
      const phoneRegex = /^[0-9]{9,}$/;
      if (!phoneRegex.test(value.replace(/\s/g, ''))) {
        return { valid: false, error: "Por favor, insira um número de telefone válido (mínimo 9 dígitos)." };
      }
    }

    if (field.min_length && value.length < field.min_length) {
      return { valid: false, error: `Mínimo de ${field.min_length} caracteres.` };
    }

    if (field.max_length && value.length > field.max_length) {
      return { valid: false, error: `Máximo de ${field.max_length} caracteres.` };
    }

    return { valid: true };
  };

  const handleUserInput = async (userMessage: string) => {
    addUserMessage(userMessage);
    setInput("");

    // If form is complete, ignore input
    if (isComplete) {
      return;
    }

    // If not started yet, check for affirmative response
    if (currentFieldIndex === -1) {
      const affirmative = /^(sim|s|yes|y|ok|vamos|quero|claro|bora|começa)/i.test(userMessage.trim());
      if (affirmative) {
        startFormCollection();
      } else {
        addAssistantMessage("Sem problema! Quando quiser preencher o formulário, é só dizer 'sim' ou 'quero começar'. 😊");
      }
      return;
    }

    const fields = getAllFields();
    
    // Guard: ensure we have fields and valid index
    if (!fields.length || currentFieldIndex >= fields.length) {
      console.error("Invalid state: no fields or index out of bounds", { 
        fieldsLength: fields.length, 
        currentFieldIndex 
      });
      return;
    }
    
    const currentField = fields[currentFieldIndex];

    // Guard: ensure current field exists
    if (!currentField) {
      console.error("Current field is undefined", { currentFieldIndex, fields });
      return;
    }

    // Validate the input
    const validation = validateField(currentField, userMessage);
    if (!validation.valid) {
      addAssistantMessage(`❌ ${validation.error}\n\nPor favor, tente novamente:`);
      return;
    }

    // Store the value and calculate next index
    const nextIndex = currentFieldIndex + 1;
    const updatedData = {
      ...collectedData,
      [currentField.field_key]: userMessage.trim()
    };
    
    // Update state
    setCollectedData(updatedData);
    setCurrentFieldIndex(nextIndex);
    
    if (nextIndex < fields.length) {
      addAssistantMessage("✓ Guardado!");
      setTimeout(() => askForField(nextIndex), 500);
    } else {
      // All done, submit with collected data
      submitFormWithData(updatedData);
    }
  };

  const submitFormWithData = async (dataToSubmit: Record<string, any>) => {
    // Ensure we have the campaign_id from formConfig
    const campaignId = formConfig?.campaign_id;
    
    if (!campaignId) {
      addAssistantMessage("❌ Erro de configuração: ID da campanha não encontrado.\n\nPor favor, use o formulário tradicional.");
      return;
    }
    
    addAssistantMessage("⏳ A submeter os seus dados...");
    setIsLoading(true);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          form_id: formConfig?.form_id || null,
          field_values: dataToSubmit,
          source: "chat_widget",
          from_chat_widget: true
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      setIsComplete(true);
      addAssistantMessage("🎉 **Obrigado!** Os seus dados foram submetidos com sucesso.\n\nEntraremos em contacto consigo brevemente!");
    } catch (error: any) {
      console.error("Error submitting form:", error);
      addAssistantMessage(`❌ Erro ao submeter: ${error.message}\n\nPor favor, tente novamente ou use o formulário tradicional.`);
    } finally {
      setIsLoading(false);
    }
  };

  const submitForm = async () => {
    await submitFormWithData(collectedData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isComplete) return;
    handleUserInput(input.trim());
  };

  const resetChat = () => {
    setMessages([]);
    setCollectedData({});
    setCurrentFieldIndex(-1);
    setIsComplete(false);
    addAssistantMessage(welcomeMessage);
  };

  const handleLocaleChange = (locale: string) => {
    // Switching language wipes the running conversation (welcome + asked questions
    // are in the previous language). We refetch config in the new locale and start over.
    setMessages([]);
    setCollectedData({});
    setCurrentFieldIndex(-1);
    setIsComplete(false);
    setFormConfig(null);
    setCurrentLocale(locale);
    loadFormConfig(locale);
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 rounded-full p-4 shadow-lg hover:shadow-xl transition-shadow"
            style={{ backgroundColor: primaryColor }}
          >
            <MessageCircle className="h-6 w-6 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] shadow-2xl rounded-2xl overflow-hidden"
          >
            <Card className="border-0 h-[550px] max-h-[calc(100vh-100px)] flex flex-col">
              {/* Header */}
              <CardHeader 
                className="py-4 px-4 flex-row items-center justify-between space-y-0"
                style={{ backgroundColor: primaryColor }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-white text-base font-medium">{title}</CardTitle>
                    <p className="text-white/70 text-xs">Online agora</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <FormLocaleSwitcher
                    defaultLocale={formConfig?.default_locale}
                    enabledLocales={formConfig?.enabled_locales}
                    currentLocale={currentLocale}
                    onChange={handleLocaleChange}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="text-white hover:bg-white/20 h-8 w-8"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>

              {/* Messages */}
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start gap-2 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div 
                        className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.role === 'user' ? 'bg-gray-200' : ''
                        }`}
                        style={message.role === 'assistant' ? { backgroundColor: primaryColor } : undefined}
                      >
                        {message.role === 'user' ? (
                          <User className="h-4 w-4 text-gray-600" />
                        ) : (
                          <Bot className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-white shadow-sm rounded-bl-md'
                        }`}
                        style={message.role === 'user' ? { backgroundColor: primaryColor } : undefined}
                      >
                        {message.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: primaryColor }} />
                      <span className="text-sm text-muted-foreground">A escrever...</span>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </CardContent>

              {/* Input */}
              <div className="p-4 border-t bg-white">
                {isComplete ? (
                  <Button 
                    onClick={resetChat} 
                    className="w-full"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Iniciar nova conversa
                  </Button>
                ) : (
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Escreva a sua resposta..."
                      disabled={isLoading}
                      className="flex-1"
                    />
                    <Button 
                      type="submit" 
                      size="icon" 
                      disabled={!input.trim() || isLoading}
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
