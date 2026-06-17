



(function() {
  class InternalChat {
    constructor() {
      this.initialized = false;
      this.currentUser = null;
      this.currentUserUid = null;
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.chatButton = null;
      this.chatPopup = null;
      this.channelLabel = null;
      this.userListContainer = null;
      this.messageContainer = null;
      this.messageInput = null;
      this.sendButton = null;
      this.charCount = null;
      this.presenceRef = null;
      this.presenceRootRef = null;
      this.presenceListener = null;
      this.messagesRef = null;
      
      
      
      
      
      
      this.currentMessageCallback = null;
      this.dragOffset = { x: 0, y: 0 };
      this.isDragging = false;
      
      
      this.usersList = [];
      
      this.lastMessageTime = {};
      
      this.channelListeners = {};
      
      this.beforeUnloadHandler = null;
      
      this.updateUserListOrder = this.updateUserListOrder.bind(this);
      this.attachLastMessageListeners = this.attachLastMessageListeners.bind(this);

      
      
      
      
      this.lastSeenTime = {};

      
      
      this.loadLastSeenTimes = this.loadLastSeenTimes.bind(this);
      this.persistLastSeenTimes = this.persistLastSeenTimes.bind(this);

      
      
      
      
      
      this.connectionRef = null;
      this.connectionListener = null;

      
      
      
      
      this.chatNotificationIndicator = null;
      this.messagePreview = null;
      this.previewChannelLabel = null;
      this.previewSenderLabel = null;
      this.previewTextLabel = null;
      this.previewHideTimer = null;
      this.previewInitializedChannels = {};
      this.lastPreviewedMessageTime = {};
      this.previewStartTime = 0;

      
      
      
      
      
      this.lastMessageInfo = {};

      
      
      
      
      
      this.lastNotificationTimestamp = 0;

      
      
      
      
      
      this.lastSoundTime = 0;

      
      
      
      
    }

    
    init(userData, usersList) {
      if (this.initialized) return;
      if (!userData) return;
      
      const auth = window.firebase && window.firebase.auth;
      const currentAuthUser = auth && auth.currentUser ? auth.currentUser : null;
      this.currentUserUid = userData.uid || (currentAuthUser ? currentAuthUser.uid : null);
      if (!this.currentUserUid) {
        console.warn('ChatModule: Unable to determine UID for current user. Chat will not initialize.');
        return;
      }
      this.currentUser = userData;
      this.initialized = true;
      
      if (usersList && Array.isArray(usersList)) {
        this.usersList = usersList;
      } else if (Array.isArray(window.users)) {
        this.usersList = window.users;
      }

      
      
      
      
      try {
        this.loadLastSeenTimes();
      } catch (_e) {
        
      }
      
      
      
      
      
      this.resetPreviewState();
      this.previewStartTime = Date.now();
      
      
      
      
      
      try {
        if (typeof this.loadLastSeenTimesRemote === 'function') {
          this.loadLastSeenTimesRemote();
        }
      } catch (_e) {
        
      }
      this.createUI();
      this.setupPresence();
      this.populateUserList();
      this.listenToPresence();
      
      this.attachLastMessageListeners();
      this.listenToMessages('public');
    }

    
    destroy() {
      if (!this.initialized) return;
      
      try {
        if (this.presenceRootRef && this.presenceListener) {
          window.firebase.off(this.presenceRootRef, 'value', this.presenceListener);
        }
      } catch (err) {
        console.error('ChatModule: error detaching presence listener', err);
      }
      this.presenceRootRef = null;
      this.presenceListener = null;
      
      try {
        if (this.messagesRef) {
          window.firebase.off(this.messagesRef, 'value');
        }
      } catch (err) {
        console.error('ChatModule: error detaching messages listener', err);
      }
      this.messagesRef = null;
      
      try {
        if (this.presenceRef) {
          window.firebase.set(this.presenceRef, {
            online: false,
            lastSeen: Date.now()
          });
        }
      } catch (err) {
        console.error('ChatModule: error setting offline presence during destroy', err);
      }
      
      try {
        if (this.connectionRef && this.connectionListener) {
          window.firebase.off(this.connectionRef, 'value', this.connectionListener);
        }
      } catch (err) {
        console.error('ChatModule: error detaching connection listener', err);
      }
      this.connectionRef = null;
      this.connectionListener = null;
      this.presenceRef = null;
      
      try {
        if (this.channelListeners) {
          Object.values(this.channelListeners).forEach(({ ref, callback }) => {
            if (ref && callback) {
              window.firebase.off(ref, 'value', callback);
            }
          });
        }
      } catch (err) {
        console.error('ChatModule: error detaching channel listeners', err);
      }

      
      this.resetPreviewState();
      this.channelListeners = {};
      this.lastMessageTime = {};
      
      this.lastMessageInfo = {};
      
      if (this.beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
      
      if (this.chatButton) {
        this.chatButton.removeEventListener('click', this.togglePopupHandler);
        this.chatButton.remove();
        this.chatButton = null;
      }
      if (this.chatPopup) {
        
        const header = this.chatPopup.querySelector('.chat-header');
        if (header) {
          header.removeEventListener('mousedown', this.startDragHandler);
        }
        
        if (this.messageInput) {
          this.messageInput.removeEventListener('input', this.inputHandler);
          this.messageInput.removeEventListener('keydown', this.keydownHandler);
        }
        if (this.sendButton) {
          this.sendButton.removeEventListener('click', this.sendHandler);
        }
        this.chatPopup.remove();
        this.chatPopup = null;
      }
      this.destroyPreviewUI();
      this.initialized = false;
      this.currentUser = null;
      this.currentUserUid = null;
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.usersList = [];
      this.lastMessageTime = {};
    }

    
    createUI() {
      
      const button = document.createElement('button');
      this.chatButton = button;
      button.id = 'chatToggleButton';
      button.type = 'button';
      button.title = '聊天';
      button.style.position = 'fixed';
      button.style.right = '1rem';
      button.style.bottom = '1rem';
      button.style.zIndex = '10000';
      button.className = 'bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg focus:outline-none';
      button.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16h10"></path></svg>`;
      document.body.appendChild(button);

      
      
      
      
      button.classList.add('relative');
      const notifDot = document.createElement('span');
      this.chatNotificationIndicator = notifDot;
      notifDot.className = 'absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 hidden';
      
      notifDot.style.transform = 'translate(50%,-50%)';
      button.appendChild(notifDot);

      this.togglePopupHandler = () => this.togglePopup();
      button.addEventListener('click', this.togglePopupHandler);

      
      const popup = document.createElement('div');
      this.chatPopup = popup;
      popup.id = 'chatPopup';
      popup.style.position = 'fixed';
      popup.style.right = '1rem';
      popup.style.bottom = '4.5rem';
      popup.style.width = '360px';
      popup.style.height = '500px';
      popup.style.maxHeight = '80vh';
      popup.style.zIndex = '10000';
      popup.className = 'hidden flex flex-col bg-white rounded-lg shadow-xl border';
      
      popup.style.resize = 'both';
      popup.style.overflow = 'hidden';

      
      const header = document.createElement('div');
      header.className = 'chat-header cursor-move flex items-center justify-between p-2 bg-gray-100 border-b';
      this.channelLabel = document.createElement('span');
      this.channelLabel.className = 'font-semibold text-gray-800 text-sm';
      this.channelLabel.textContent = '主頻道';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.className = 'text-xl text-gray-500 hover:text-gray-700 focus:outline-none';
      closeBtn.addEventListener('click', () => {
        popup.classList.add('hidden');
      });
      header.appendChild(this.channelLabel);
      header.appendChild(closeBtn);
      popup.appendChild(header);

      
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'flex flex-1 overflow-hidden';
      
      const userList = document.createElement('div');
      this.userListContainer = userList;
      userList.className = 'w-1/3 border-r overflow-y-auto';
      popup.appendChild(contentWrapper);
      
      const messagesWrapper = document.createElement('div');
      messagesWrapper.className = 'flex-1 flex flex-col';
      
      const messageList = document.createElement('div');
      this.messageContainer = messageList;
      messageList.className = 'flex-1 overflow-y-auto p-2 space-y-2 bg-white';
      
      const inputArea = document.createElement('div');
      inputArea.className = 'p-2 border-t bg-gray-50';
      
      const textarea = document.createElement('textarea');
      this.messageInput = textarea;
      textarea.className = 'w-full border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring focus:border-blue-300';
      textarea.rows = 2;
      textarea.maxLength = 500;
      textarea.placeholder = '輸入訊息...';
      
      const charCounter = document.createElement('div');
      this.charCount = charCounter;
      charCounter.className = 'text-xs text-gray-400 text-right pt-1';
      charCounter.textContent = '0/500';
      
      const sendBtn = document.createElement('button');
      this.sendButton = sendBtn;
      sendBtn.type = 'button';
      sendBtn.className = 'mt-2 w-full bg-blue-500 hover:bg-blue-600 text-white py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed';
      sendBtn.textContent = '發送';
      sendBtn.disabled = true;
      inputArea.appendChild(textarea);
      inputArea.appendChild(charCounter);
      inputArea.appendChild(sendBtn);

      messagesWrapper.appendChild(messageList);
      messagesWrapper.appendChild(inputArea);

      contentWrapper.appendChild(userList);
      contentWrapper.appendChild(messagesWrapper);

      popup.appendChild(contentWrapper);
      document.body.appendChild(popup);
      this.createPreviewUI();

      
      this.startDragHandler = (ev) => {
        this.isDragging = true;
        
        const rect = this.chatPopup.getBoundingClientRect();
        this.dragOffset.x = ev.clientX - rect.left;
        this.dragOffset.y = ev.clientY - rect.top;
        
        document.addEventListener('mousemove', this.dragHandler);
        document.addEventListener('mouseup', this.stopDragHandler);
      };
      this.dragHandler = (ev) => {
        if (!this.isDragging) return;
        
        const newLeft = ev.clientX - this.dragOffset.x;
        const newTop = ev.clientY - this.dragOffset.y;
        
        const maxLeft = window.innerWidth - this.chatPopup.offsetWidth;
        const maxTop = window.innerHeight - this.chatPopup.offsetHeight;
        this.chatPopup.style.left = Math.min(Math.max(newLeft, 0), maxLeft) + 'px';
        this.chatPopup.style.top = Math.min(Math.max(newTop, 0), maxTop) + 'px';
        this.chatPopup.style.right = 'auto';
        this.chatPopup.style.bottom = 'auto';
      };
      this.stopDragHandler = () => {
        this.isDragging = false;
        document.removeEventListener('mousemove', this.dragHandler);
        document.removeEventListener('mouseup', this.stopDragHandler);
      };
      header.addEventListener('mousedown', this.startDragHandler);

      
      this.inputHandler = () => {
        const text = this.messageInput.value;
        this.charCount.textContent = `${text.length}/500`;
        this.sendButton.disabled = text.trim().length === 0;
        
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
      };
      this.messageInput.addEventListener('input', this.inputHandler);
      this.keydownHandler = (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          if (!this.sendButton.disabled) {
            this.sendMessage();
          }
        }
      };
      this.messageInput.addEventListener('keydown', this.keydownHandler);
      
      this.sendHandler = () => {
        this.sendMessage();
      };
      this.sendButton.addEventListener('click', this.sendHandler);
    }

    
    togglePopup() {
      
      
      
      
      const wasHidden = this.chatPopup.classList.contains('hidden');
      if (wasHidden) {
        this.chatPopup.classList.remove('hidden');
        
        if (this.messageContainer) {
          try {
            this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
          } catch (_e) {
            
          }
        }
        this.markCurrentChannelAsRead();
      } else {
        this.chatPopup.classList.add('hidden');
      }
      
      
      
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    createPreviewUI() {
      if (this.messagePreview) return;
      const preview = document.createElement('button');
      this.messagePreview = preview;
      preview.type = 'button';
      preview.className = 'hidden fixed w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl text-left p-4';
      preview.style.right = '1rem';
      preview.style.bottom = '5.5rem';
      preview.style.zIndex = '10001';
      preview.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      preview.style.opacity = '0';
      preview.style.transform = 'translateY(8px)';
      preview.style.transformOrigin = 'bottom right';

      const channelLabel = document.createElement('div');
      this.previewChannelLabel = channelLabel;
      channelLabel.className = 'text-xs font-semibold text-blue-600 mb-1';

      const senderLabel = document.createElement('div');
      this.previewSenderLabel = senderLabel;
      senderLabel.className = 'text-sm font-medium text-gray-900 mb-1';

      const textLabel = document.createElement('div');
      this.previewTextLabel = textLabel;
      textLabel.className = 'text-sm text-gray-600 break-words';

      preview.appendChild(channelLabel);
      preview.appendChild(senderLabel);
      preview.appendChild(textLabel);

      preview.addEventListener('click', () => {
        preview.classList.add('hidden');
        this.hideMessagePreview();
      });

      document.body.appendChild(preview);
    }

    destroyPreviewUI() {
      if (this.previewHideTimer) {
        window.clearTimeout(this.previewHideTimer);
        this.previewHideTimer = null;
      }
      if (this.messagePreview) {
        this.messagePreview.remove();
        this.messagePreview = null;
      }
      this.previewChannelLabel = null;
      this.previewSenderLabel = null;
      this.previewTextLabel = null;
    }

    hideMessagePreview() {
      if (!this.messagePreview) return;
      if (this.previewHideTimer) {
        window.clearTimeout(this.previewHideTimer);
        this.previewHideTimer = null;
      }
      this.messagePreview.style.opacity = '0';
      this.messagePreview.style.transform = 'translateY(8px)';
      window.setTimeout(() => {
        if (this.messagePreview && this.messagePreview.style.opacity === '0') {
          this.messagePreview.classList.add('hidden');
        }
      }, 200);
    }

    truncatePreviewText(text) {
      const normalized = String(text || '').replace(/\s+/g, ' ').trim();
      if (normalized.length <= 90) {
        return normalized;
      }
      return normalized.slice(0, 90) + '...';
    }

    getPreviewChannelLabel(channelId) {
      if (channelId === 'public') {
        return '主頻道新訊息';
      }
      return '私人聊天新訊息';
    }

    shouldShowPreviewForChannel(channelId) {
      const popupHidden = this.chatPopup && this.chatPopup.classList.contains('hidden');
      if (popupHidden) return true;
      if (channelId === 'public') {
        return this.currentChannel !== 'public';
      }
      return !(this.currentChannel === 'private' && this.privateChatId === channelId);
    }

    showMessagePreview(channelId, previewData) {
      if (!this.messagePreview || !previewData) return;
      const senderName = previewData.senderName || '新訊息';
      const text = this.truncatePreviewText(previewData.text || '');
      this.previewChannelLabel.textContent = this.getPreviewChannelLabel(channelId);
      this.previewSenderLabel.textContent = senderName;
      this.previewTextLabel.textContent = text || '你收到一則新訊息';
      this.messagePreview.classList.remove('hidden');
      this.messagePreview.style.opacity = '1';
      this.messagePreview.style.transform = 'translateY(0)';
      if (this.previewHideTimer) {
        window.clearTimeout(this.previewHideTimer);
      }
      this.previewHideTimer = window.setTimeout(() => {
        this.hideMessagePreview();
      }, 8000);
    }

    handleIncomingPreview(channelId, latestMsg, latestTs) {
      if (!channelId) return;
      const previousPreviewTs = this.lastPreviewedMessageTime[channelId] || 0;
      const wasInitialized = !!this.previewInitializedChannels[channelId];
      this.previewInitializedChannels[channelId] = true;
      if (!latestMsg || !latestTs) {
        return;
      }
      if (latestTs <= previousPreviewTs) {
        return;
      }
      this.lastPreviewedMessageTime[channelId] = latestTs;
      const isNewAfterInit = latestTs > (this.previewStartTime || 0);
      if (!wasInitialized && !isNewAfterInit) {
        return;
      }
      const senderId = latestMsg.senderId || null;
      if (senderId && String(senderId) === String(this.currentUserUid)) {
        return;
      }
      if (!this.shouldShowPreviewForChannel(channelId)) {
        return;
      }
      this.showMessagePreview(channelId, latestMsg);
    }

    
    setupPresence() {
      try {
        
        this.presenceRef = window.firebase.ref(window.firebase.rtdb, `presence/${this.currentUserUid}`);
        
        
        
        
        this.connectionRef = window.firebase.ref(window.firebase.rtdb, '.info/connected');
        this.connectionListener = (snapshot) => {
          const isConnected = !!snapshot.val();
          if (isConnected) {
            try {
              
              if (this.presenceRef && window.firebase.onDisconnect) {
                
                window.firebase.onDisconnect(this.presenceRef).set({
                  online: false,
                  lastSeen: Date.now()
                });
              }
            } catch (err) {
              console.warn('ChatModule: Failed to set onDisconnect for presence', err);
            }
            
            
            window.firebase.set(this.presenceRef, {
              online: true,
              lastSeen: Date.now()
            }).catch((err) => {
              console.error('ChatModule: Failed to set presence', err);
            });
          }
        };
        window.firebase.onValue(this.connectionRef, this.connectionListener);

        
        this.beforeUnloadHandler = () => {
          try {
            if (this.presenceRef) {
              window.firebase.set(this.presenceRef, {
                online: false,
                lastSeen: Date.now()
              });
            }
          } catch (_e) {
            
          }
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
      } catch (err) {
        console.error('ChatModule: Error in setupPresence', err);
      }
    }

    
    populateUserList() {
      
      this.userListContainer.innerHTML = '';
      
        const createItem = (userObj, isGroup = false) => {
        const item = document.createElement('div');
        item.className = 'flex items-center px-3 py-2 cursor-pointer hover:bg-gray-100';
        item.dataset.uid = userObj.uid || '';
        
        const avatar = document.createElement('div');
        avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mr-2 flex-shrink-0';
        if (isGroup) {
          avatar.textContent = '#';
          avatar.style.backgroundColor = '#6B7280'; 
        } else {
          
          const nameSource = userObj.name || userObj.username || '?';
          const firstChar = nameSource.charAt(0);
          avatar.textContent = firstChar;
          
          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
          let index = 0;
          const uidStr = String(userObj.uid || userObj.id || '');
          if (uidStr) {
            for (let i = 0; i < uidStr.length; i++) {
              index = (index + uidStr.charCodeAt(i)) % colors.length;
            }
          }
          avatar.style.backgroundColor = colors[index];
        }
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'flex-1 text-sm truncate';
        nameSpan.textContent = isGroup ? '主頻道' : (userObj.name || userObj.username || '未知用戶');
        
        const statusDot = document.createElement('span');
        statusDot.className = 'w-2 h-2 rounded-full ml-2 flex-shrink-0';
        statusDot.style.backgroundColor = isGroup ? 'transparent' : '#9CA3AF'; 
        statusDot.dataset.statusDot = 'true';
        item.appendChild(avatar);
        item.appendChild(nameSpan);
        item.appendChild(statusDot);

        
        
        
        
        const newIndicator = document.createElement('span');
        newIndicator.dataset.newIndicator = 'true';
        
        
        newIndicator.className = 'ml-auto w-2 h-2 rounded-full bg-red-500 hidden';
        item.appendChild(newIndicator);
        
        item.addEventListener('click', () => {
          
          const allItems = this.userListContainer.querySelectorAll('.bg-blue-100');
          allItems.forEach(it => it.classList.remove('bg-blue-100'));
          item.classList.add('bg-blue-100');
          if (isGroup) {
            this.selectPublicChannel();
          } else {
            this.selectPrivateChat(userObj);
          }
        });
        return item;
      };
      
      const groupItem = createItem({ username: '主頻道', uid: 'public' }, true);
      groupItem.classList.add('bg-blue-100'); 
      this.userListContainer.appendChild(groupItem);
      
      const list = Array.isArray(this.usersList) ? this.usersList : [];
      list.forEach(u => {
        if (!u) return;
        
        const uid = u.uid || u.id || null;
        if (!uid) return;
        if (uid === this.currentUserUid || String(uid) === String(this.currentUser.id)) return;
        const userItem = createItem(u, false);
        this.userListContainer.appendChild(userItem);
      });
    }

    
    listenToPresence() {
      try {
        this.presenceRootRef = window.firebase.ref(window.firebase.rtdb, 'presence');
        this.presenceListener = (snapshot) => {
          const presenceData = snapshot.val() || {};
          
          let onlineCount = 0;
          Object.keys(presenceData).forEach(uid => {
            const entry = presenceData[uid];
            
            let isOnline = false;
            if (entry && typeof entry === 'object') {
              isOnline = !!entry.online;
            } else {
              isOnline = !!entry;
            }
            if (isOnline && uid !== this.currentUserUid) {
              onlineCount++;
            }
          });
          
          const items = this.userListContainer.querySelectorAll('div[data-uid]');
          items.forEach(item => {
            const uid = item.dataset.uid;
            const dot = item.querySelector('span[data-status-dot="true"]');
            if (!dot) return;
            
            
            if (uid === 'public') {
              dot.style.backgroundColor = 'transparent';
              return;
            }
            const entry = presenceData[uid];
            let isOnline = false;
            if (entry && typeof entry === 'object') {
              isOnline = !!entry.online;
            } else {
              isOnline = !!entry;
            }
            if (isOnline) {
              dot.style.backgroundColor = '#10B981'; 
            } else {
              dot.style.backgroundColor = '#9CA3AF'; 
            }
          });
        };
        window.firebase.onValue(this.presenceRootRef, this.presenceListener);
      } catch (err) {
        console.error('ChatModule: Failed to listen to presence', err);
      }
    }

    
    selectPublicChannel() {
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.channelLabel.textContent = '主頻道';
      this.listenToMessages('public');
      this.markChannelAsRead('public');
    }

    
    selectPrivateChat(userObj) {
      if (!userObj) return;
      const uid = userObj.uid || userObj.id;
      if (!uid) return;
      
      const ids = [String(this.currentUserUid), String(uid)].sort();
      const chatId = ids.join('_');
      this.privateChatId = chatId;
      this.currentChannel = 'private';
      
      this.channelLabel.textContent = userObj.name || userObj.username || '私人聊天';
      this.listenToMessages(chatId);
      this.markChannelAsRead(chatId);
    }

    
    listenToMessages(channelId) {
      
      
      
      
      
      
      
      if (this.messagesRef && this.currentMessageCallback) {
        try {
          window.firebase.off(this.messagesRef, 'value', this.currentMessageCallback);
        } catch (err) {
          console.error('ChatModule: error detaching old message listener', err);
        }
      }
      
      let path;
      if (channelId === 'public') {
        path = 'chat/messages/public';
      } else {
        path = `chat/private/${channelId}`;
      }
      
      const baseRef = window.firebase.ref(window.firebase.rtdb, path);
      const q = window.firebase.query(baseRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(100));
      this.messagesRef = q;
      
      this.currentMessageCallback = (snapshot) => {
        const data = snapshot.val() || {};
        const messages = Object.values(data);
        
        messages.sort((a, b) => {
          const ta = this.getMessageTimestamp(a);
          const tb = this.getMessageTimestamp(b);
          return ta - tb;
        });
        
        this.renderMessages(messages);
        
        let latestTs = 0;
        let latestMsg = null;
        messages.forEach((msg) => {
          const ts = this.getMessageTimestamp(msg);
          if (ts > latestTs) {
            latestTs = ts;
            latestMsg = msg;
          }
        });
        this.lastMessageTime[channelId] = latestTs;
        
        if (latestMsg) {
          this.lastMessageInfo[channelId] = {
            senderId: latestMsg.senderId || null,
            senderName: latestMsg.senderName || '',
            text: latestMsg.text || '',
            timestamp: latestTs
          };
        }
        this.handleIncomingPreview(channelId, this.lastMessageInfo[channelId] || latestMsg, latestTs);
        
        
        
        
        
        try {
          let isCurrent = false;
          if (this.currentChannel === 'public' && channelId === 'public') {
            isCurrent = true;
          } else if (this.currentChannel === 'private' && this.privateChatId && channelId === this.privateChatId) {
            isCurrent = true;
          }
          
          const popupHidden = (this.chatPopup && this.chatPopup.classList.contains('hidden'));
          if (isCurrent && !popupHidden) {
            this.markChannelAsRead(channelId);
          }
        } catch (_e) {
          
        }
        
        if (typeof this.updateUserListOrder === 'function') {
          this.updateUserListOrder();
        }
      };
      
      window.firebase.onValue(this.messagesRef, this.currentMessageCallback);
    }

    
    renderMessages(messages) {
      if (!this.messageContainer) return;
      this.messageContainer.innerHTML = '';
      const fragment = document.createDocumentFragment();
      messages.forEach(msg => {
        const isSelf = (msg.senderId === this.currentUserUid);
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-start space-x-2 ' + (isSelf ? 'justify-end' : '');
        
        if (!isSelf) {
          const avatar = document.createElement('div');
          avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0';
          const firstChar = (msg.senderName || '?').charAt(0);
          avatar.textContent = firstChar;
          const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
          let index = 0;
          if (msg.senderId) {
            for (let i = 0; i < String(msg.senderId).length; i++) {
              index = (index + String(msg.senderId).charCodeAt(i)) % colors.length;
            }
          }
          avatar.style.backgroundColor = colors[index];
          wrapper.appendChild(avatar);
        }
        
        const content = document.createElement('div');
        content.className = 'flex flex-col max-w-[70%]';
        
        const header = document.createElement('div');
        header.className = 'flex items-center text-xs text-gray-500 mb-1';
        if (!isSelf) {
          const nameSpan = document.createElement('span');
          nameSpan.className = 'font-medium text-gray-700 mr-1';
          nameSpan.textContent = msg.senderName || '';
          header.appendChild(nameSpan);
        }
        const timeSpan = document.createElement('span');
        timeSpan.textContent = this.formatTimestamp(this.getMessageTimestamp(msg));
        header.appendChild(timeSpan);
        
        const bubble = document.createElement('div');
        bubble.className = (isSelf ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800') + ' rounded-2xl px-3 py-2 text-sm break-words';
        bubble.textContent = msg.text || '';
        content.appendChild(header);
        content.appendChild(bubble);
        wrapper.appendChild(content);
        if (isSelf) {
          
          const avatar = document.createElement('div');
          avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ml-2';
          const nameSourceSelf = (this.currentUser && (this.currentUser.name || this.currentUser.username)) || '?';
          const firstChar = nameSourceSelf.charAt(0);
          avatar.textContent = firstChar;
          const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
          let index = 0;
          for (let i = 0; i < String(this.currentUserUid).length; i++) {
            index = (index + String(this.currentUserUid).charCodeAt(i)) % colors.length;
          }
          avatar.style.backgroundColor = colors[index];
          wrapper.appendChild(avatar);
        }
        fragment.appendChild(wrapper);
      });
      this.messageContainer.appendChild(fragment);
      
      try {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
      } catch (_e) {
        
      }
    }

    
    getNumericTimestamp(value, fallback = 0) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
      return fallback;
    }

    
    getMessageTimestamp(msg) {
      if (!msg || typeof msg !== 'object') return 0;
      const serverTimestamp = this.getNumericTimestamp(msg.timestamp, NaN);
      if (!isNaN(serverTimestamp)) {
        return serverTimestamp;
      }
      return this.getNumericTimestamp(msg.clientTimestamp, 0);
    }

    
    getCurrentChannelId() {
      if (this.currentChannel === 'public') {
        return 'public';
      }
      if (this.currentChannel === 'private' && this.privateChatId) {
        return this.privateChatId;
      }
      return null;
    }

    
    getChannelPeerUid(channelId) {
      if (!channelId || channelId === 'public') return null;
      const ids = String(channelId).split('_');
      if (ids.length < 2) return null;
      return ids.find((id) => String(id) !== String(this.currentUserUid)) || null;
    }

    
    buildSummaryPayload(channelId, messageData) {
      const clientTimestamp = this.getNumericTimestamp(messageData && messageData.clientTimestamp, Date.now());
      return {
        channelId: channelId,
        senderId: messageData && messageData.senderId ? messageData.senderId : null,
        senderName: messageData && messageData.senderName ? messageData.senderName : '',
        text: messageData && messageData.text ? messageData.text : '',
        timestamp: (window.firebase && typeof window.firebase.serverTimestamp === 'function')
          ? window.firebase.serverTimestamp()
          : clientTimestamp,
        clientTimestamp: clientTimestamp,
        channelType: channelId === 'public' ? 'public' : 'private'
      };
    }

    
    appendSummaryUpdates(updates, channelId, messageData) {
      if (!updates || !channelId || !messageData) return;
      const summaryPayload = this.buildSummaryPayload(channelId, messageData);
      if (channelId === 'public') {
        updates['chat/summaries/public'] = summaryPayload;
        return;
      }

      const peerUid = this.getChannelPeerUid(channelId);
      if (!peerUid) return;
      updates[`chat/userSummaries/${this.currentUserUid}/${channelId}`] = {
        ...summaryPayload,
        peerUid: peerUid
      };
      updates[`chat/userSummaries/${peerUid}/${channelId}`] = {
        ...summaryPayload,
        peerUid: this.currentUserUid
      };
    }

    
    applySummaryToChannel(channelId, summary) {
      if (!channelId || !summary || typeof summary !== 'object') return;
      const latestTs = this.getMessageTimestamp(summary);
      if (!latestTs) return;
      this.lastMessageTime[channelId] = latestTs;
      this.lastMessageInfo[channelId] = {
        senderId: summary.senderId || null,
        senderName: summary.senderName || '',
        text: summary.text || '',
        timestamp: latestTs
      };
      this.handleIncomingPreview(channelId, this.lastMessageInfo[channelId], latestTs);
    }

    
    markChannelAsRead(channelId) {
      if (!channelId) return;
      const latestTs = this.lastMessageTime[channelId] || 0;
      if (!latestTs) {
        if (typeof this.updateNewMessageIndicators === 'function') {
          this.updateNewMessageIndicators();
        }
        return;
      }
      if ((this.lastSeenTime[channelId] || 0) < latestTs) {
        this.lastSeenTime[channelId] = latestTs;
        if (typeof this.persistLastSeenTimes === 'function') {
          this.persistLastSeenTimes();
        }
      }
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    
    markCurrentChannelAsRead() {
      const channelId = this.getCurrentChannelId();
      this.markChannelAsRead(channelId);
    }

    
    formatTimestamp(ts) {
      try {
        const normalized = this.getNumericTimestamp(ts, NaN);
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
      } catch (_e) {
        return '';
      }
    }

    
    sendMessage() {
      const text = (this.messageInput && this.messageInput.value) ? this.messageInput.value.trim() : '';
      if (!text) return;
      const clientTimestamp = Date.now();
      const messageData = {
        senderId: this.currentUserUid,
        
        senderName: (this.currentUser && (this.currentUser.name || this.currentUser.username)) || '',
        text: text,
        timestamp: (window.firebase && typeof window.firebase.serverTimestamp === 'function')
          ? window.firebase.serverTimestamp()
          : clientTimestamp,
        clientTimestamp: clientTimestamp
      };
      let path;
      if (this.currentChannel === 'public') {
        path = 'chat/messages/public';
      } else if (this.privateChatId) {
        path = `chat/private/${this.privateChatId}`;
      } else {
        return;
      }
      
      const channelId = (this.currentChannel === 'public') ? 'public' : this.privateChatId;
      const baseRef = window.firebase.ref(window.firebase.rtdb, path);
      const generatedRef = (window.firebase && typeof window.firebase.push === 'function')
        ? window.firebase.push(baseRef)
        : null;
      const messageKey = generatedRef && generatedRef.key ? generatedRef.key : String(clientTimestamp);
      const rootRef = window.firebase.ref(window.firebase.rtdb);
      const updates = {
        [`${path}/${messageKey}`]: messageData
      };
      this.appendSummaryUpdates(updates, channelId, messageData);
      window.firebase.update(rootRef, updates).then(() => {
        
        this.messageInput.value = '';
        this.charCount.textContent = '0/500';
        this.sendButton.disabled = true;
        
        this.messageInput.style.height = 'auto';
        if (channelId) {
          this.lastSeenTime[channelId] = clientTimestamp;
          if ((this.lastMessageTime[channelId] || 0) < clientTimestamp) {
            this.lastMessageTime[channelId] = clientTimestamp;
          }
          this.lastMessageInfo[channelId] = {
            senderId: messageData.senderId || null,
            senderName: messageData.senderName || '',
            text: messageData.text || '',
            timestamp: clientTimestamp
          };
          if (typeof this.persistLastSeenTimes === 'function') {
            this.persistLastSeenTimes();
          }
          if (typeof this.updateNewMessageIndicators === 'function') {
            this.updateNewMessageIndicators();
          }
        }
      }).catch((err) => {
        console.error('ChatModule: failed to send message', err);
      });
    }

    
    attachLastMessageListeners() {
      
      try {
        if (this.channelListeners) {
          Object.values(this.channelListeners).forEach(({ ref, callback }) => {
            if (ref && callback) {
              
              window.firebase.off(ref, 'value', callback);
            }
          });
        }
      } catch (_err) {
        console.error('ChatModule: error detaching channel listeners', _err);
      }
      this.channelListeners = {};
      
      try {
        const publicSummaryRef = window.firebase.ref(window.firebase.rtdb, 'chat/summaries/public');
        const publicCallback = (snapshot) => {
          const summary = snapshot.val();
          if (summary) {
            this.applySummaryToChannel('public', summary);
          }
          if (typeof this.updateUserListOrder === 'function') {
            this.updateUserListOrder();
          }
        };
        window.firebase.onValue(publicSummaryRef, publicCallback);
        this.channelListeners['public'] = { ref: publicSummaryRef, callback: publicCallback };
      } catch (err) {
        console.error('ChatModule: Failed to attach public summary listener', err);
      }
      
      try {
        const summaryRef = window.firebase.ref(window.firebase.rtdb, `chat/userSummaries/${this.currentUserUid}`);
        const summaryCallback = (snapshot) => {
          const summaryMap = snapshot.val() || {};
          Object.keys(summaryMap).forEach((channelId) => {
            this.applySummaryToChannel(channelId, summaryMap[channelId]);
          });
          this.bootstrapMissingConversationSummaries(summaryMap);
          if (typeof this.updateUserListOrder === 'function') {
            this.updateUserListOrder();
          }
        };
        window.firebase.onValue(summaryRef, summaryCallback);
        this.channelListeners['userSummaries'] = { ref: summaryRef, callback: summaryCallback };
      } catch (err) {
        console.error('ChatModule: Failed to attach user summary listener', err);
      }

      
      
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    
    bootstrapMissingConversationSummaries(summaryMap = {}) {
      try {
        const get = window.firebase && window.firebase.get;
        const ref = window.firebase && window.firebase.ref;
        const query = window.firebase && window.firebase.query;
        const orderByChild = window.firebase && window.firebase.orderByChild;
        const limitToLast = window.firebase && window.firebase.limitToLast;
        const rtdb = window.firebase && window.firebase.rtdb;
        if (!get || !ref || !query || !orderByChild || !limitToLast || !rtdb) {
          return;
        }

        const tasks = [];
        if (!summaryMap.public && !this.lastMessageInfo['public']) {
          const publicRef = ref(rtdb, 'chat/messages/public');
          const publicQuery = query(publicRef, orderByChild('timestamp'), limitToLast(1));
          tasks.push(
            get(publicQuery).then((snapshot) => {
              snapshot.forEach((child) => {
                this.applySummaryToChannel('public', child.val() || {});
              });
            }).catch((err) => {
              console.error('ChatModule: Failed to bootstrap public summary', err);
            })
          );
        }

        const list = Array.isArray(this.usersList) ? this.usersList : [];
        list.forEach((u) => {
          if (!u) return;
          const uid = u.uid || u.id;
          if (!uid) return;
          if (String(uid) === String(this.currentUserUid) || String(uid) === String(this.currentUser && this.currentUser.id)) return;

          const chatId = [String(this.currentUserUid), String(uid)].sort().join('_');
          if (summaryMap[chatId] || this.lastMessageInfo[chatId]) return;

          const chatRef = ref(rtdb, `chat/private/${chatId}`);
          const lastMessageQuery = query(chatRef, orderByChild('timestamp'), limitToLast(1));
          tasks.push(
            get(lastMessageQuery).then((snapshot) => {
              snapshot.forEach((child) => {
                this.applySummaryToChannel(chatId, child.val() || {});
              });
            }).catch((err) => {
              console.error('ChatModule: Failed to bootstrap private summary', err);
            })
          );
        });

        if (tasks.length > 0) {
          Promise.allSettled(tasks).then(() => {
            if (typeof this.updateUserListOrder === 'function') {
              this.updateUserListOrder();
            }
          });
        }
      } catch (err) {
        console.error('ChatModule: Failed to bootstrap conversation summaries', err);
      }
    }

    
    updateUserListOrder() {
      if (!this.userListContainer) return;
      const items = Array.from(this.userListContainer.children);
      if (!items || items.length === 0) return;
      
      let selectedUid = null;
      items.forEach((item) => {
        if (item.classList.contains('bg-blue-100')) {
          selectedUid = item.dataset.uid;
        }
      });
      
      items.sort((a, b) => {
        const uidA = a.dataset.uid;
        const uidB = b.dataset.uid;
        
        let chA = null;
        let chB = null;
        if (uidA === 'public') {
          chA = 'public';
        } else {
          chA = [String(this.currentUserUid), String(uidA)].sort().join('_');
        }
        if (uidB === 'public') {
          chB = 'public';
        } else {
          chB = [String(this.currentUserUid), String(uidB)].sort().join('_');
        }
        const timeA = this.lastMessageTime[chA] || 0;
        const timeB = this.lastMessageTime[chB] || 0;
        if (timeA === timeB) return 0;
        return timeB - timeA;
      });
      
      items.forEach((item) => {
        this.userListContainer.appendChild(item);
      });
      
      items.forEach((item) => {
        if (selectedUid && item.dataset.uid === selectedUid) {
          item.classList.add('bg-blue-100');
        } else {
          item.classList.remove('bg-blue-100');
        }
      });

      
      
      
      
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    
    updateNewMessageIndicators() {
      if (!this.userListContainer) return;
      
      
      
      
      
      const popupHidden = (this.chatPopup && this.chatPopup.classList.contains('hidden'));
      const items = this.userListContainer.querySelectorAll('div[data-uid]');
      items.forEach((item) => {
        const uid = item.dataset.uid;
        let channelId;
        if (uid === 'public') {
          channelId = 'public';
        } else {
          channelId = [String(this.currentUserUid), String(uid)].sort().join('_');
        }
        const indicator = item.querySelector('span[data-new-indicator="true"]');
        if (!indicator) return;
        
        if (!popupHidden) {
          if (this.currentChannel === 'public' && channelId === 'public') {
            indicator.classList.add('hidden');
            return;
          }
          if (this.currentChannel === 'private' && this.privateChatId === channelId) {
            indicator.classList.add('hidden');
            return;
          }
        }
        const lastMsg = this.lastMessageTime[channelId] || 0;
        const lastSeen = this.lastSeenTime[channelId] || 0;
        if (lastMsg > lastSeen) {
          indicator.classList.remove('hidden');
        } else {
          indicator.classList.add('hidden');
        }
      });

      
      
      
      
      
      
      if (this.chatNotificationIndicator) {
        let hasUnread = false;
        
        let latestUnreadTs = 0;
        items.forEach((item) => {
          const uid = item.dataset.uid;
          let channelId;
          if (uid === 'public') {
            channelId = 'public';
          } else {
            channelId = [String(this.currentUserUid), String(uid)].sort().join('_');
          }
          const lastMsg = this.lastMessageTime[channelId] || 0;
          const lastSeen = this.lastSeenTime[channelId] || 0;
          
          
          
          
          if (!popupHidden) {
            if (this.currentChannel === 'public' && channelId === 'public') {
              return;
            }
            if (this.currentChannel === 'private' && this.privateChatId === channelId) {
              return;
            }
          }
          if (lastMsg > lastSeen) {
            hasUnread = true;
            if (lastMsg > latestUnreadTs) {
              latestUnreadTs = lastMsg;
            }
          }
        });
        
        const indicatorVisible = !this.chatNotificationIndicator.classList.contains('hidden');
        
        if (hasUnread && this.chatPopup && this.chatPopup.classList.contains('hidden')) {
          
          this.chatNotificationIndicator.classList.remove('hidden');
          
          if (latestUnreadTs > (this.lastNotificationTimestamp || 0)) {
            
            this.lastNotificationTimestamp = latestUnreadTs;
            
            const now = Date.now();
            const intervalMs = 10000;
            if ((now - (this.lastSoundTime || 0)) >= intervalMs) {
              
              if (typeof this.playNotificationSound === 'function') {
                this.playNotificationSound();
              }
              this.lastSoundTime = now;
            }
          }
        } else {
          
          if (indicatorVisible) {
            this.chatNotificationIndicator.classList.add('hidden');
          }
        }
      }

    }

    
    /**
     * Persist the lastSeenTime map to localStorage so that unread indicators
     * remain accurate across page reloads and logins. The data is stored
     * under a key unique to the current user's UID. Failures to write are
     * silently ignored (e.g. when localStorage is unavailable).
     */
    persistLastSeenTimes() {
      try {
        if (!this.currentUserUid) return;
        // Persist to localStorage as a fallback for offline access.
        try {
          const key = `chat_lastSeen_${this.currentUserUid}`;
          const data = JSON.stringify(this.lastSeenTime || {});
          localStorage.setItem(key, data);
        } catch (_e) {
          // Ignore localStorage errors
        }
        // Also persist to Firebase Realtime Database so that unread status
        // remains accurate across sessions and devices. Prefer using set()
        // so that obsolete channel keys are removed. Fallback to update()
        // if set() is unavailable.
        const rtdb = window.firebase && window.firebase.rtdb;
        const ref = window.firebase && window.firebase.ref;
        const set = window.firebase && window.firebase.set;
        const update = window.firebase && window.firebase.update;
        if (rtdb && ref && (set || update)) {
          const path = `chat/lastSeen/${this.currentUserUid}`;
          const lastSeenRef = ref(rtdb, path);
          const payload = this.lastSeenTime || {};
          if (set) {
            set(lastSeenRef, payload).catch((err) => {
              console.error('ChatModule: error persisting lastSeenTime to database', err);
            });
          } else {
            update(lastSeenRef, payload).catch((err) => {
              console.error('ChatModule: error persisting lastSeenTime to database', err);
            });
          }
        }
      } catch (err) {
        console.error('ChatModule: error in persistLastSeenTimes', err);
      }
    }

    /**
     * Load previously persisted lastSeenTime values from localStorage. If no
     * data exists for the current user, the map remains empty. Invalid
     * JSON or other errors are silently ignored.
     */
    loadLastSeenTimes() {
      try {
        if (!this.currentUserUid) return;
        const key = `chat_lastSeen_${this.currentUserUid}`;
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.lastSeenTime = parsed;
        }
      } catch (_e) {
        // Ignore errors reading/parsing localStorage
      }
    }

    resetPreviewState() {
      if (this.previewHideTimer) {
        window.clearTimeout(this.previewHideTimer);
        this.previewHideTimer = null;
      }
      this.previewInitializedChannels = {};
      this.lastPreviewedMessageTime = {};
      this.previewStartTime = 0;
      if (this.messagePreview) {
        this.messagePreview.classList.add('hidden');
        this.messagePreview.style.opacity = '0';
        this.messagePreview.style.transform = 'translateY(8px)';
      }
      try {
        if (this.currentUserUid) {
          localStorage.removeItem(`chat_lastPreview_${this.currentUserUid}`);
        }
      } catch (_e) {
        
      }
    }

    /**
     * Fetch lastSeenTime from Firebase Realtime Database and merge with local data.
     * See persistLastSeenTimes() for format. This method returns a Promise.
     */
    loadLastSeenTimesRemote() {
      try {
        if (!this.currentUserUid) {
          return Promise.resolve();
        }
        const rtdb = window.firebase && window.firebase.rtdb;
        const ref = window.firebase && window.firebase.ref;
        const get = window.firebase && window.firebase.get;
        if (!rtdb || !ref || !get) {
          return Promise.resolve();
        }
        const path = `chat/lastSeen/${this.currentUserUid}`;
        const lastSeenRef = ref(rtdb, path);
        return get(lastSeenRef).then((snapshot) => {
          const remoteData = snapshot && snapshot.exists() ? snapshot.val() : {};
          if (remoteData && typeof remoteData === 'object') {
            // Merge remote data with current lastSeenTime. Keep the max timestamp for each channel.
            const merged = {};
            Object.keys(remoteData).forEach((key) => {
              const val = remoteData[key];
              if (typeof val === 'number') {
                merged[key] = val;
              }
            });
            Object.keys(this.lastSeenTime || {}).forEach((key) => {
              const localVal = this.lastSeenTime[key];
              if (typeof localVal !== 'number') return;
              if (!merged[key] || localVal > merged[key]) {
                merged[key] = localVal;
              }
            });
            this.lastSeenTime = merged;
            // Persist merged result back to database and localStorage
            if (typeof this.persistLastSeenTimes === 'function') {
              this.persistLastSeenTimes();
            }
            // Update unread indicators after remote load
            if (typeof this.updateNewMessageIndicators === 'function') {
              this.updateNewMessageIndicators();
            }
          }
        }).catch((err) => {
          console.error('ChatModule: error loading lastSeenTime from database', err);
        });
      } catch (err) {
        console.error('ChatModule: exception in loadLastSeenTimesRemote', err);
        return Promise.resolve();
      }
    }

    /**
     * Play a brief notification sound to alert the user of a new chat message.
     * This uses the Web Audio API to generate a short sine wave tone. The
     * implementation mirrors the playNotificationSound() function used in
     * system.js for other notifications. Surround in try/catch to avoid
     * crashing on browsers that do not support AudioContext.
     */
    playNotificationSound() {
      try {
        const AudioContext = window.AudioContext || window['webkitAudioContext'];
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();
        // Fade out over 0.8 seconds
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        oscillator.stop(ctx.currentTime + 0.8);
      } catch (_e) {
        // Silently ignore errors playing sound
      }
    }
  }

  // Create a single instance of InternalChat and expose init/destroy methods
  const chatInstance = new InternalChat();
  window.ChatModule = {
    initChat: (userData, usersList) => {
      try {
        chatInstance.init(userData, usersList);
      } catch (err) {
        console.error('ChatModule: initChat failed', err);
      }
    },
    destroyChat: () => {
      try {
        chatInstance.destroy();
      } catch (err) {
        console.error('ChatModule: destroyChat failed', err);
      }
    }
  };
})();
