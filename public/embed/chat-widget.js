(function() {
  'use strict';

  // Never load inside iframes (e.g., when the public form is embedded on a website)
  var isInIframe = false;
  try {
    isInIframe = window.self !== window.top;
  } catch (e) {
    // Cross-origin access to window.top can throw; assume iframe
    isInIframe = true;
  }
  if (isInIframe) {
    return;
  }

  // Don't load widget on public lead form pages (they have their own form)
  var pathname = window.location.pathname;
  var isPublicFormPage = pathname.indexOf('/form/') === 0 || pathname.indexOf('/lead-form/') === 0;
  if (isPublicFormPage) {
    return;
  }

  // Configuration
  var SUPABASE_URL = 'https://jfuyxszlgetnmdwfdmgw.supabase.co';
  
  // Get script parameters (robust for GTM / dynamic script injection)
  var scripts = document.getElementsByTagName('script');
  var currentScript = document.currentScript;
  var scriptSrc = '';
  
  if (!currentScript) {
    for (var si = scripts.length - 1; si >= 0; si--) {
      var s = scripts[si];
      var src = s.getAttribute('src') || '';
      if (src.indexOf('/embed/chat-widget.js') !== -1 || src.indexOf('chat-widget.js') !== -1) {
        currentScript = s;
        scriptSrc = src;
        break;
      }
    }
  } else {
    scriptSrc = currentScript.getAttribute('src') || '';
  }
  
  // Parse URL query parameters as fallback (e.g., chat-widget.js?form_id=xxx&color=%23ff0000)
  function getUrlParam(url, param) {
    var match = url.match(new RegExp('[?&]' + param + '=([^&]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  
  // Get config from data attributes first, then URL params as fallback
  var formId = null;
  var primaryColor = '#7c3aed';
  var title = 'Assistente Virtual';
  var welcomeMessage = '';
  
  if (currentScript) {
    formId = currentScript.getAttribute('data-form-id');
    primaryColor = currentScript.getAttribute('data-color') || primaryColor;
    title = currentScript.getAttribute('data-title') || title;
    welcomeMessage = currentScript.getAttribute('data-welcome') || welcomeMessage;
  }
  
  // URL param fallbacks
  if (!formId && scriptSrc) formId = getUrlParam(scriptSrc, 'form_id');
  if (scriptSrc && getUrlParam(scriptSrc, 'color')) primaryColor = getUrlParam(scriptSrc, 'color');
  if (scriptSrc && getUrlParam(scriptSrc, 'title')) title = getUrlParam(scriptSrc, 'title');
  
  console.log('[Olyvia Widget] Config loaded:', { formId: formId, color: primaryColor, title: title, scriptSrc: scriptSrc });

  if (!formId) {
    console.error('Olyvia Chat Widget: data-form-id is required');
    return;
  }

  // State
  var isOpen = false;
  var conversationHistory = [];
  var formConfig = null;
  var collectedData = {};
  var isComplete = false;
  var isLoading = false;
  var leadId = null;
  var campaignId = null;
  var lastCompletedStep = 0;
  var fieldDefinitions = [];

  function main() {
  
   // Inject styles
   var styles = document.createElement('style');
   styles.textContent = '\n' +
    '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");\n' +
    '.olyvia-chat-window, .olyvia-chat-window * {\n' +
    '  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n' +
    '  -webkit-font-smoothing: antialiased;\n' +
    '  -moz-osx-font-smoothing: grayscale;\n' +
    '}\n' +
    '.olyvia-widget-btn {\n' +
    '  position: fixed;\n' +
    '  bottom: 24px;\n' +
    '  right: 24px;\n' +
    '  z-index: 999999;\n' +
    '  width: 60px;\n' +
    '  height: 60px;\n' +
    '  border-radius: 50%;\n' +
    '  border: none;\n' +
    '  cursor: pointer;\n' +
    '  box-shadow: 0 4px 20px rgba(0,0,0,0.2);\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  justify-content: center;\n' +
    '  transition: transform 0.2s, box-shadow 0.2s;\n' +
    '}\n' +
    '.olyvia-widget-btn:hover {\n' +
    '  transform: scale(1.05);\n' +
    '  box-shadow: 0 6px 25px rgba(0,0,0,0.25);\n' +
    '}\n' +
    '.olyvia-widget-btn svg {\n' +
    '  width: 28px;\n' +
    '  height: 28px;\n' +
    '  fill: white;\n' +
    '}\n' +
    '.olyvia-chat-window {\n' +
    '  position: fixed;\n' +
    '  bottom: 24px;\n' +
    '  right: 24px;\n' +
    '  z-index: 999999;\n' +
    '  width: 380px;\n' +
    '  max-width: calc(100vw - 48px);\n' +
    '  height: 550px;\n' +
    '  max-height: calc(100vh - 100px);\n' +
    '  background: white;\n' +
    '  border-radius: 16px;\n' +
    '  box-shadow: 0 10px 40px rgba(0,0,0,0.2);\n' +
    '  display: flex;\n' +
    '  flex-direction: column;\n' +
    '  overflow: hidden;\n' +
    '  animation: olyviaSlideIn 0.2s ease-out;\n' +
    '}\n' +
    '@keyframes olyviaSlideIn {\n' +
    '  from { opacity: 0; transform: translateY(20px) scale(0.95); }\n' +
    '  to { opacity: 1; transform: translateY(0) scale(1); }\n' +
    '}\n' +
    '.olyvia-header {\n' +
    '  padding: 16px;\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  justify-content: space-between;\n' +
    '}\n' +
    '.olyvia-header-info {\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  gap: 12px;\n' +
    '}\n' +
    '.olyvia-avatar {\n' +
    '  width: 40px;\n' +
    '  height: 40px;\n' +
    '  border-radius: 50%;\n' +
    '  background: rgba(255,255,255,0.2);\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  justify-content: center;\n' +
    '}\n' +
    '.olyvia-avatar svg {\n' +
    '  width: 20px;\n' +
    '  height: 20px;\n' +
    '  fill: white;\n' +
    '}\n' +
    '.olyvia-title {\n' +
    '  color: white;\n' +
    '  font-size: 16px;\n' +
    '  font-weight: 500;\n' +
    '  margin: 0;\n' +
    '}\n' +
    '.olyvia-status {\n' +
    '  color: rgba(255,255,255,0.7);\n' +
    '  font-size: 12px;\n' +
    '  margin: 0;\n' +
    '}\n' +
    '.olyvia-close {\n' +
    '  background: transparent;\n' +
    '  border: none;\n' +
    '  cursor: pointer;\n' +
    '  padding: 8px;\n' +
    '  border-radius: 8px;\n' +
    '  transition: background 0.2s;\n' +
    '}\n' +
    '.olyvia-close:hover {\n' +
    '  background: rgba(255,255,255,0.2);\n' +
    '}\n' +
    '.olyvia-close svg {\n' +
    '  width: 20px;\n' +
    '  height: 20px;\n' +
    '  fill: white;\n' +
    '}\n' +
    '.olyvia-messages {\n' +
    '  flex: 1;\n' +
    '  overflow-y: auto;\n' +
    '  padding: 16px;\n' +
    '  background: #f9fafb;\n' +
    '  display: flex;\n' +
    '  flex-direction: column;\n' +
    '  gap: 12px;\n' +
    '}\n' +
    '.olyvia-msg {\n' +
    '  display: flex;\n' +
    '  gap: 8px;\n' +
    '  max-width: 85%;\n' +
    '}\n' +
    '.olyvia-msg.user {\n' +
    '  align-self: flex-end;\n' +
    '  flex-direction: row-reverse;\n' +
    '}\n' +
    '.olyvia-msg-avatar {\n' +
    '  width: 28px;\n' +
    '  height: 28px;\n' +
    '  border-radius: 50%;\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  justify-content: center;\n' +
    '  flex-shrink: 0;\n' +
    '}\n' +
    '.olyvia-msg-avatar svg {\n' +
    '  width: 14px;\n' +
    '  height: 14px;\n' +
    '}\n' +
    '.olyvia-msg.assistant .olyvia-msg-avatar {\n' +
    '  background: ' + primaryColor + ';\n' +
    '}\n' +
    '.olyvia-msg.assistant .olyvia-msg-avatar svg {\n' +
    '  fill: white;\n' +
    '}\n' +
    '.olyvia-msg.user .olyvia-msg-avatar {\n' +
    '  background: #e5e7eb;\n' +
    '}\n' +
    '.olyvia-msg.user .olyvia-msg-avatar svg {\n' +
    '  fill: #6b7280;\n' +
    '}\n' +
    '.olyvia-msg-bubble {\n' +
    '  padding: 10px 14px;\n' +
    '  border-radius: 16px;\n' +
    '  font-size: 14px;\n' +
    '  line-height: 1.5;\n' +
    '  white-space: pre-wrap;\n' +
    '  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;\n' +
    '  letter-spacing: -0.01em;\n' +
    '}\n' +
    '.olyvia-msg.assistant .olyvia-msg-bubble {\n' +
    '  background: white;\n' +
    '  box-shadow: 0 1px 3px rgba(0,0,0,0.1);\n' +
    '  border-bottom-left-radius: 4px;\n' +
    '}\n' +
    '.olyvia-msg.user .olyvia-msg-bubble {\n' +
    '  background: ' + primaryColor + ';\n' +
    '  color: white;\n' +
    '  border-bottom-right-radius: 4px;\n' +
    '}\n' +
    '.olyvia-typing {\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  gap: 8px;\n' +
    '  padding: 10px 14px;\n' +
    '  background: white;\n' +
    '  border-radius: 16px;\n' +
    '  box-shadow: 0 1px 3px rgba(0,0,0,0.1);\n' +
    '  width: fit-content;\n' +
    '}\n' +
    '.olyvia-typing-dot {\n' +
    '  width: 6px;\n' +
    '  height: 6px;\n' +
    '  background: #9ca3af;\n' +
    '  border-radius: 50%;\n' +
    '  animation: olyviaTyping 1.4s ease-in-out infinite;\n' +
    '}\n' +
    '.olyvia-typing-dot:nth-child(2) { animation-delay: 0.2s; }\n' +
    '.olyvia-typing-dot:nth-child(3) { animation-delay: 0.4s; }\n' +
    '@keyframes olyviaTyping {\n' +
    '  0%, 60%, 100% { transform: translateY(0); }\n' +
    '  30% { transform: translateY(-4px); }\n' +
    '}\n' +
    '.olyvia-input-area {\n' +
    '  padding: 16px;\n' +
    '  border-top: 1px solid #e5e7eb;\n' +
    '  background: white;\n' +
    '}\n' +
    '.olyvia-input-form {\n' +
    '  display: flex;\n' +
    '  gap: 8px;\n' +
    '}\n' +
    '.olyvia-input {\n' +
    '  flex: 1;\n' +
    '  padding: 10px 14px;\n' +
    '  border: 1px solid #e5e7eb;\n' +
    '  border-radius: 8px;\n' +
    '  font-size: 14px;\n' +
    '  outline: none;\n' +
    '  transition: border-color 0.2s;\n' +
    '}\n' +
    '.olyvia-input:focus {\n' +
    '  border-color: ' + primaryColor + ';\n' +
    '}\n' +
    '.olyvia-send {\n' +
    '  width: 40px;\n' +
    '  height: 40px;\n' +
    '  border: none;\n' +
    '  border-radius: 8px;\n' +
    '  cursor: pointer;\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  justify-content: center;\n' +
    '  transition: opacity 0.2s;\n' +
    '}\n' +
    '.olyvia-send:disabled {\n' +
    '  opacity: 0.5;\n' +
    '  cursor: not-allowed;\n' +
    '}\n' +
    '.olyvia-send svg {\n' +
    '  width: 18px;\n' +
    '  height: 18px;\n' +
    '  fill: white;\n' +
    '}\n' +
    '.olyvia-reset {\n' +
    '  width: 100%;\n' +
    '  padding: 12px;\n' +
    '  border: none;\n' +
    '  border-radius: 8px;\n' +
    '  cursor: pointer;\n' +
    '  font-size: 14px;\n' +
    '  font-weight: 500;\n' +
    '  color: white;\n' +
    '}\n';
  document.head.appendChild(styles);

  // SVG icons
  var icons = {
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM9.5 14a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>'
  };

  // Create floating button
  var button = document.createElement('button');
  button.className = 'olyvia-widget-btn';
  button.style.backgroundColor = primaryColor;
  button.innerHTML = icons.chat;
  document.body.appendChild(button);

  // Create chat window
  var chatWindow = document.createElement('div');
  chatWindow.className = 'olyvia-chat-window';
  chatWindow.style.display = 'none';
  chatWindow.innerHTML = '\n' +
    '<div class="olyvia-header" style="background:' + primaryColor + '">\n' +
    '  <div class="olyvia-header-info">\n' +
    '    <div class="olyvia-avatar">' + icons.bot + '</div>\n' +
    '    <div>\n' +
    '      <p class="olyvia-title">' + escapeHtml(title) + '</p>\n' +
    '      <p class="olyvia-status">Online agora</p>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '  <button class="olyvia-close">' + icons.close + '</button>\n' +
    '</div>\n' +
    '<div class="olyvia-messages"></div>\n' +
    '<div class="olyvia-input-area">\n' +
    '  <form class="olyvia-input-form">\n' +
    '    <input type="text" class="olyvia-input" placeholder="Escreva a sua mensagem...">\n' +
    '    <button type="submit" class="olyvia-send" style="background:' + primaryColor + '">' + icons.send + '</button>\n' +
    '  </form>\n' +
    '</div>\n';
  document.body.appendChild(chatWindow);

  // References
  var messagesContainer = chatWindow.querySelector('.olyvia-messages');
  var inputForm = chatWindow.querySelector('.olyvia-input-form');
  var input = chatWindow.querySelector('.olyvia-input');
  var sendBtn = chatWindow.querySelector('.olyvia-send');
  var closeBtn = chatWindow.querySelector('.olyvia-close');

  // Helper functions
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function addMessage(role, content) {
    conversationHistory.push({ role: role, content: content });
    renderMessages();
  }

  function renderMessages() {
    var html = '';
    for (var i = 0; i < conversationHistory.length; i++) {
      var msg = conversationHistory[i];
      var displayRole = msg.role === 'user' ? 'user' : 'assistant';
      var icon = displayRole === 'user' ? icons.user : icons.bot;
      html += '<div class="olyvia-msg ' + displayRole + '">\n' +
        '<div class="olyvia-msg-avatar">' + icon + '</div>\n' +
        '<div class="olyvia-msg-bubble">' + escapeHtml(msg.content) + '</div>\n' +
        '</div>\n';
    }
    if (isLoading) {
      html += '<div class="olyvia-typing">\n' +
        '<div class="olyvia-typing-dot"></div>\n' +
        '<div class="olyvia-typing-dot"></div>\n' +
        '<div class="olyvia-typing-dot"></div>\n' +
        '</div>\n';
    }
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showResetButton() {
    var inputArea = chatWindow.querySelector('.olyvia-input-area');
    inputArea.innerHTML = '<button class="olyvia-reset" style="background:' + primaryColor + '">Iniciar nova conversa</button>';
    inputArea.querySelector('.olyvia-reset').addEventListener('click', resetChat);
  }

  function callAI(userMessage) {
    isLoading = true;
    renderMessages();

    var messagesForAI = conversationHistory.map(function(m) {
      return { role: m.role, content: m.content };
    });

    var xhr = new XMLHttpRequest();
    xhr.open('POST', SUPABASE_URL + '/functions/v1/chat-widget-ai', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    xhr.onload = function() {
      isLoading = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var response = JSON.parse(xhr.responseText);

          // chat-widget-ai devolve campaign_id; precisamos disto para criar/update de leads
          if (response.campaign_id && !campaignId) {
            campaignId = response.campaign_id;
          }
          
          // Store extracted data
          if (response.extracted_field && response.extracted_value) {
            collectedData[response.extracted_field] = response.extracted_value;
            
            // Check if we should save progress (create/update lead)
            checkAndSaveProgress(response);
          }
          
          // Add AI response to conversation
          addMessage('assistant', response.message);
          
          // IGNORE AI's is_complete flag - validate on client side only
          // Check completion based on step validation, not AI response
          var completedStep = getCompletedStep();
          var maxStep = fieldDefinitions.length > 0 ? Math.max.apply(null, fieldDefinitions.map(function(f) { return f.step_number || 1; })) : 1;
          
          // Count required fields and filled required fields
          var requiredFieldCount = fieldDefinitions.filter(function(f) { return f.is_required; }).length;
          var filledRequiredCount = 0;
          var missingFields = [];
          
          fieldDefinitions.filter(function(f) { return f.is_required; }).forEach(function(f) {
            if (collectedData[f.field_key] !== undefined && collectedData[f.field_key] !== '') {
              filledRequiredCount++;
            } else {
              missingFields.push(f.field_key);
            }
          });
          
          console.log('[Olyvia Widget] Validation - Step:', completedStep, '/', maxStep, 
            '| Required:', filledRequiredCount, '/', requiredFieldCount,
            '| Missing:', missingFields.join(', ') || 'none',
            '| Mode:', response.conversation_mode,
            '| AI is_complete:', response.is_complete);
          
          // Only mark complete if:
          // 1. Client lookup mode and AI says complete, OR
          // 2. Lead capture mode AND we have field definitions AND all required fields are actually filled
          var isActuallyComplete = false;
          
          if (response.conversation_mode === 'client_lookup' && response.is_complete) {
            isActuallyComplete = true;
          } else if (response.conversation_mode === 'lead_capture') {
            // ONLY complete if we have fields loaded AND all required are filled
            isActuallyComplete = fieldDefinitions.length > 0 && 
                                 requiredFieldCount > 0 && 
                                 filledRequiredCount >= requiredFieldCount;
          }
          
          if (isActuallyComplete) {
            console.log('[Olyvia Widget] ✅ Form COMPLETE - showing reset button');
            // Final update if needed
            if (leadId) {
              updateLead(true);
            } else {
              createLead(true);
            }
          }
        } catch(e) {
          console.error('Error parsing AI response:', e);
          addMessage('assistant', 'Desculpe, ocorreu um erro. Pode tentar novamente?');
        }
      } else {
        addMessage('assistant', 'Desculpe, ocorreu um erro de conexão. Pode tentar novamente?');
      }
    };
    
    xhr.onerror = function() {
      isLoading = false;
      addMessage('assistant', 'Desculpe, erro de conexão. Por favor, tente novamente.');
    };

    xhr.send(JSON.stringify({
      form_id: formId,
      messages: messagesForAI,
      collected_data: collectedData
    }));
  }

  // Calculate which step is complete based on collected fields
  function getCompletedStep() {
    if (!fieldDefinitions || fieldDefinitions.length === 0) return 0;
    
    var maxStep = Math.max.apply(null, fieldDefinitions.map(function(f) { return f.step_number || 1; }));
    
    for (var step = 1; step <= maxStep; step++) {
      var stepFields = fieldDefinitions.filter(function(f) { return f.step_number === step; });
      var requiredFields = stepFields.filter(function(f) { return f.is_required; });
      
      var allFilled = requiredFields.every(function(f) {
        return collectedData[f.field_key] !== undefined && collectedData[f.field_key] !== '';
      });
      
      if (!allFilled) {
        return step - 1;
      }
    }
    
    return maxStep;
  }

  // Count how many fields have been collected
  function getCollectedFieldsCount() {
    var count = 0;
    for (var key in collectedData) {
      if (collectedData.hasOwnProperty(key) && collectedData[key] !== undefined && collectedData[key] !== '') {
        count++;
      }
    }
    return count;
  }

  // Track last saved field count to know when to update
  var lastSavedFieldCount = 0;

  function checkAndSaveProgress(aiResponse) {
    var currentFieldCount = getCollectedFieldsCount();
    var completedStep = getCompletedStep();
    
    // Save as soon as we have at least 1 field (email, name, phone, etc.)
    if (currentFieldCount > 0 && currentFieldCount > lastSavedFieldCount) {
      if (!leadId) {
        // Create lead on first field collected
        createLead(false);
      } else {
        // Update lead on each new field
        updateLead(false);
      }
      lastSavedFieldCount = currentFieldCount;
    }
    
    // Track step progress for metadata
    if (completedStep > lastCompletedStep) {
      lastCompletedStep = completedStep;
    }
  }

  function createLead(isFinal) {
    if (!campaignId) return;

    var xhr = new XMLHttpRequest();
    xhr.open('POST', SUPABASE_URL + '/functions/v1/create-lead', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var response = JSON.parse(xhr.responseText);
          leadId = response.lead_id;
          console.log('Lead created:', leadId, 'Step:', lastCompletedStep);
          
          // Show reset only if isFinal AND client-side validation passes
          if (isFinal) {
            isComplete = true;
            showResetButton();
          }
        } catch(e) {
          console.error('Error parsing create-lead response:', e);
        }
      }
    };

    xhr.send(JSON.stringify({
      campaign_id: campaignId,
      step_number: lastCompletedStep || 1,
      field_values: collectedData,
      source: 'embed_chat_widget_ai',
      from_chat_widget: true
    }));
  }

  function updateLead(isFinal) {
    if (!leadId) return;

    var xhr = new XMLHttpRequest();
    xhr.open('POST', SUPABASE_URL + '/functions/v1/update-lead', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var response = JSON.parse(xhr.responseText);
          console.log('Lead updated:', leadId, 'Step:', lastCompletedStep);
          
          // Show reset only if isFinal (validation already done before calling this)
          if (isFinal) {
            isComplete = true;
            showResetButton();
          }
        } catch(e) {
          console.error('Error parsing update-lead response:', e);
        }
      }
    };

    xhr.send(JSON.stringify({
      lead_id: leadId,
      step_number: lastCompletedStep,
      field_values: collectedData,
      from_chat_widget: true
    }));
  }

  function handleUserInput(userMessage) {
    addMessage('user', userMessage);
    callAI(userMessage);
  }

  function loadFormConfig(autoStart) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SUPABASE_URL + '/functions/v1/get-form-data?form_id=' + encodeURIComponent(formId), true);
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          formConfig = JSON.parse(xhr.responseText);
          
          // Extract field definitions from form config
          if (formConfig.steps) {
            fieldDefinitions = [];
            formConfig.steps.forEach(function(step) {
              if (step.fields) {
                step.fields.forEach(function(field) {
                  fieldDefinitions.push({
                    field_key: field.field_key,
                    field_label: field.field_label,
                    is_required: field.is_required,
                    step_number: step.step_number || 1
                  });
                });
              }
            });
            
            // Log loaded fields for debugging
            var requiredCount = fieldDefinitions.filter(function(f) { return f.is_required; }).length;
            console.log('[Olyvia Widget] Loaded', fieldDefinitions.length, 'fields,', requiredCount, 'required:', 
              fieldDefinitions.map(function(f) { return f.field_key + (f.is_required ? '*' : ''); }).join(', '));
          }
          
          // Auto-open widget if configured and autoStart is true
          if (autoStart && formConfig.widget_open_by_default && !isOpen) {
            openChat();
          }
          
          // Start conversation with AI (only if chat is open)
          if (isOpen) {
            callAI('Olá!');
          }
        } catch(e) {
          addMessage('assistant', 'Desculpe, ocorreu um erro ao carregar. Por favor, tente novamente mais tarde.');
        }
      } else {
        addMessage('assistant', 'Desculpe, ocorreu um erro ao carregar. Por favor, tente novamente mais tarde.');
      }
    };
    
    xhr.onerror = function() {
      addMessage('assistant', 'Desculpe, erro de conexão. Por favor, tente novamente mais tarde.');
    };
    
    xhr.send();
  }

  function resetChat() {
    conversationHistory = [];
    collectedData = {};
    isComplete = false;
    isLoading = false;
    leadId = null;
    lastCompletedStep = 0;
    
    // Restore input form
    var inputArea = chatWindow.querySelector('.olyvia-input-area');
    inputArea.innerHTML = '<form class="olyvia-input-form">\n' +
      '<input type="text" class="olyvia-input" placeholder="Escreva a sua mensagem...">\n' +
      '<button type="submit" class="olyvia-send" style="background:' + primaryColor + '">' + icons.send + '</button>\n' +
      '</form>';
    
    // Re-attach event listeners
    inputForm = inputArea.querySelector('.olyvia-input-form');
    input = inputArea.querySelector('.olyvia-input');
    sendBtn = inputArea.querySelector('.olyvia-send');
    
    inputForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var value = input.value.trim();
      if (value && !isLoading && !isComplete) {
        handleUserInput(value);
        input.value = '';
      }
    });
    
    // Start fresh conversation with AI
    callAI('Olá!');
  }

  function openChat() {
    isOpen = true;
    button.style.display = 'none';
    chatWindow.style.display = 'flex';
    
    if (!formConfig) {
      loadFormConfig(false);
    } else if (conversationHistory.length === 0) {
      // Start conversation if form config already loaded but no messages
      callAI('Olá!');
    }
    
    setTimeout(function() { input.focus(); }, 300);
  }

  function closeChat() {
    isOpen = false;
    button.style.display = 'flex';
    chatWindow.style.display = 'none';
  }

  // Event listeners
  button.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);
  
   inputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var value = input.value.trim();
    if (value && !isLoading && !isComplete) {
      handleUserInput(value);
      input.value = '';
    }
  });

  // Load form config on startup to check for auto-open
  loadFormConfig(true);

  }

  // GTM pode disparar antes de existir document.body; inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
