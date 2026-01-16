



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

      
      
      
      
      
      this.chatPreview = null;

      
      
      
      
      
      
      
      this.lastMessageInfo = {};

      
      
      
      
      
      this.lastNotificationTimestamp = 0;

      
      
      
      
      
      this.lastSoundTime = 0;

      
      
      
      
      this.previewTimer = null;

      
      
      
      
      
      
      
      
      this.lastPreviewedTimestamp = 0;

      
      
      this.loadLastPreviewedTimestamp = this.loadLastPreviewedTimestamp.bind(this);
      this.persistLastPreviewedTimestamp = this.persistLastPreviewedTimestamp.bind(this);
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
      
      
      
      
      
      try {
        this.loadLastPreviewedTimestamp();
        if (!this.lastPreviewedTimestamp || typeof this.lastPreviewedTimestamp !== 'number') {
          this.lastPreviewedTimestamp = Date.now();
          if (typeof this.persistLastPreviewedTimestamp === 'function') {
            this.persistLastPreviewedTimestamp();
          }
        }
      } catch (_e) {
        
      }
      
      
      
      
      
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

      
      try {
        if (this.chatPreview) {
          this.chatPreview.classList.add('hidden');
        }
        if (this.previewTimer) {
          clearTimeout(this.previewTimer);
          this.previewTimer = null;
        }
      } catch (_e) {
        
      }
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

      
      
      
      
      
      const preview = document.createElement('div');
      this.chatPreview = preview;
      
      
      
      preview.className = 'absolute hidden max-w-xs bg-white text-gray-800 text-sm p-2 rounded-lg shadow-lg border border-gray-200';
      preview.style.right = '0';
      
      
      
      preview.style.bottom = '100%';
      preview.style.marginBottom = '0.5rem';
      
      
      preview.style.pointerEvents = 'none';
      button.appendChild(preview);
      
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
      } else {
        this.chatPopup.classList.add('hidden');
      }
      
      
      
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
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

      
      
      
      const ts = this.lastMessageTime['public'] || Date.now();
      this.lastSeenTime['public'] = ts;
      
      if (typeof this.persistLastSeenTimes === 'function') {
        this.persistLastSeenTimes();
      }
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
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

      
      
      
      const last = this.lastMessageTime[chatId] || Date.now();
      this.lastSeenTime[chatId] = last;
      
      if (typeof this.persistLastSeenTimes === 'function') {
        this.persistLastSeenTimes();
      }
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
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
          const ta = a.timestamp || 0;
          const tb = b.timestamp || 0;
          return ta - tb;
        });
        
        this.renderMessages(messages);
        
        let latestTs = 0;
        let latestMsg = null;
        messages.forEach((msg) => {
          const ts = msg.timestamp || 0;
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
        
        
        
        
        
        try {
          let isCurrent = false;
          if (this.currentChannel === 'public' && channelId === 'public') {
            isCurrent = true;
          } else if (this.currentChannel === 'private' && this.privateChatId && channelId === this.privateChatId) {
            isCurrent = true;
          }
          
          const popupHidden = (this.chatPopup && this.chatPopup.classList.contains('hidden'));
          if (isCurrent && !popupHidden) {
            this.lastSeenTime[channelId] = latestTs;
            
            if (typeof this.persistLastSeenTimes === 'function') {
              this.persistLastSeenTimes();
            }
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
        timeSpan.textContent = this.formatTimestamp(msg.timestamp);
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

    
    formatTimestamp(ts) {
      try {
        const date = new Date(parseInt(ts, 10));
        if (isNaN(date.getTime())) return '';
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      } catch (_e) {
        return '';
      }
    }

    
    sendMessage() {
      const text = (this.messageInput && this.messageInput.value) ? this.messageInput.value.trim() : '';
      if (!text) return;
      const timestamp = Date.now();
      const messageData = {
        senderId: this.currentUserUid,
        
        senderName: (this.currentUser && (this.currentUser.name || this.currentUser.username)) || '',
        text: text,
        timestamp: timestamp
      };
      let path;
      if (this.currentChannel === 'public') {
        path = 'chat/messages/public';
      } else if (this.privateChatId) {
        path = `chat/private/${this.privateChatId}`;
      } else {
        return;
      }
      
      const msgRef = window.firebase.ref(window.firebase.rtdb, `${path}/${timestamp}`);
      window.firebase.set(msgRef, messageData).then(() => {
        
        this.messageInput.value = '';
        this.charCount.textContent = '0/500';
        this.sendButton.disabled = true;
        
        this.messageInput.style.height = 'auto';

        
        
        
        const channelId = (this.currentChannel === 'public') ? 'public' : this.privateChatId;
        if (channelId) {
          this.lastSeenTime[channelId] = timestamp;
          if (typeof this.updateNewMessageIndicators === 'function') {
            this.updateNewMessageIndicators();
          }

          
          if (typeof this.persistLastSeenTimes === 'function') {
            this.persistLastSeenTimes();
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
        const publicRef = window.firebase.ref(window.firebase.rtdb, 'chat/messages/public');
        
        const publicQuery = window.firebase.query(publicRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(1));
        const publicCallback = (snapshot) => {
          
          let latest = 0;
          let latestMsg = null;
          snapshot.forEach((child) => {
            const msg = child.val() || {};
            const ts = msg.timestamp || 0;
            if (ts > latest) {
              latest = ts;
              latestMsg = msg;
            }
          });
          
          this.lastMessageTime['public'] = latest;
          
          if (latestMsg) {
            this.lastMessageInfo['public'] = {
              senderId: latestMsg.senderId || null,
              senderName: latestMsg.senderName || '',
              text: latestMsg.text || '',
              timestamp: latest
            };
          }
          if (typeof this.updateUserListOrder === 'function') {
            this.updateUserListOrder();
          }
        };
        window.firebase.onValue(publicQuery, publicCallback);
        this.channelListeners['public'] = { ref: publicQuery, callback: publicCallback };
      } catch (err) {
        console.error('ChatModule: Failed to attach last message listener for public', err);
      }
      
      try {
        const list = Array.isArray(this.usersList) ? this.usersList : [];
        list.forEach((u) => {
          if (!u) return;
          const uid = u.uid || u.id;
          if (!uid) return;
          
          if (String(uid) === String(this.currentUserUid) || String(uid) === String(this.currentUser && this.currentUser.id)) return;
          const chatId = [String(this.currentUserUid), String(uid)].sort().join('_');
          const path = `chat/private/${chatId}`;
          const baseRef = window.firebase.ref(window.firebase.rtdb, path);
          
          const q = window.firebase.query(baseRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(1));
          const cb = (snapshot) => {
            let latest = 0;
            let latestMsg = null;
            snapshot.forEach((child) => {
              const msg = child.val() || {};
              const ts = msg.timestamp || 0;
              if (ts > latest) {
                latest = ts;
                latestMsg = msg;
              }
            });
            
            this.lastMessageTime[chatId] = latest;
            
            if (latestMsg) {
              this.lastMessageInfo[chatId] = {
                senderId: latestMsg.senderId || null,
                senderName: latestMsg.senderName || '',
                text: latestMsg.text || '',
                timestamp: latest
              };
            }
            if (typeof this.updateUserListOrder === 'function') {
              this.updateUserListOrder();
            }
          };
          window.firebase.onValue(q, cb);
          this.channelListeners[chatId] = { ref: q, callback: cb };
        });
      } catch (err) {
        console.error('ChatModule: Failed to attach last message listeners for private chats', err);
      }

      
      
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
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

      
      
      
      
      
      if (typeof this.updateChatPreview === 'function') {
        this.updateChatPreview();
      }
    }

    
    updateChatPreview() {
      
      if (!this.chatPreview) return;
      
      const popupHidden = (this.chatPopup && this.chatPopup.classList.contains('hidden'));
      if (!popupHidden) {
        
        if (this.previewTimer) {
          clearTimeout(this.previewTimer);
          this.previewTimer = null;
        }
        
        if (!this.chatPreview.classList.contains('hidden')) {
          this.chatPreview.classList.remove('fade-in');
          this.chatPreview.classList.add('fade-out');
          
          setTimeout(() => {
            this.chatPreview.classList.add('hidden');
            this.chatPreview.classList.remove('fade-out');
          }, 300);
        } else {
          
          this.chatPreview.classList.add('hidden');
        }
        return;
      }
      
      
      let latestInfo = null;
      let latestTs = 0;
      try {
        const channels = Object.keys(this.lastMessageTime || {});
        channels.forEach((ch) => {
          const lastMsgTs = this.lastMessageTime[ch] || 0;
          const lastSeenTs = this.lastSeenTime[ch] || 0;
          
          if (lastMsgTs > lastSeenTs && lastMsgTs > latestTs) {
            const info = this.lastMessageInfo && this.lastMessageInfo[ch];
            if (!info) return;
            
            if (String(info.senderId) === String(this.currentUserUid)) return;
            latestInfo = info;
            latestTs = lastMsgTs;
          }
        });
      } catch (_err) {
        
      }
      
      
      
      
      if (latestInfo) {
        const latestTsValue = latestInfo.timestamp || 0;
        if (!(latestTsValue > (this.lastPreviewedTimestamp || 0))) {
          
          latestInfo = null;
        }
      }
      if (latestInfo) {
        
        
        const escapeHtml = (str) => {
          return String(str || '').replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        };
        const maxLen = 60;
        let text = latestInfo.text || '';
        if (text.length > maxLen) {
          text = text.slice(0, maxLen) + '…';
        }
        const safeName = escapeHtml(latestInfo.senderName || '');
        const safeText = escapeHtml(text);
        // Format preview with sender name on top and message below. Use Tailwind classes for styling.
        // The name is bold and slightly larger; the message is normal weight.
        this.chatPreview.innerHTML = `
          <div class="font-medium text-sm text-gray-800 mb-0.5">${safeName}</div>
          <div class="text-gray-700 text-sm leading-tight break-words">${safeText}</div>
        `;
        // Remove any hiding and fade-out classes before showing
        this.chatPreview.classList.remove('hidden', 'fade-out');
        // Trigger fade-in animation
        this.chatPreview.classList.add('fade-in');
        // Remove fade-in class after animation completes so that future animations can retrigger
        setTimeout(() => {
          this.chatPreview.classList.remove('fade-in');
        }, 300);
        // Clear any existing timer before starting a new one
        if (this.previewTimer) {
          clearTimeout(this.previewTimer);
        }
        // Start timer to auto-hide preview after 6 seconds
        this.previewTimer = setTimeout(() => {
          // Initiate fade-out
          this.chatPreview.classList.remove('fade-in');
          this.chatPreview.classList.add('fade-out');
          // After fade-out completes, hide and clean up
          setTimeout(() => {
            this.chatPreview.classList.add('hidden');
            this.chatPreview.classList.remove('fade-out');
          }, 300);
        }, 6000);
        // Update the lastPreviewedTimestamp so this message will not
        // trigger another preview. Persist to localStorage.
        this.lastPreviewedTimestamp = latestInfo.timestamp || 0;
        if (typeof this.persistLastPreviewedTimestamp === 'function') {
          this.persistLastPreviewedTimestamp();
        }
      } else {
        // No unread messages or none that qualify; hide preview and clear timer
        if (this.previewTimer) {
          clearTimeout(this.previewTimer);
          this.previewTimer = null;
        }
        // If preview is visible, fade it out then hide
        if (!this.chatPreview.classList.contains('hidden')) {
          this.chatPreview.classList.remove('fade-in');
          this.chatPreview.classList.add('fade-out');
          setTimeout(() => {
            this.chatPreview.classList.add('hidden');
            this.chatPreview.classList.remove('fade-out');
          }, 300);
        } else {
          this.chatPreview.classList.add('hidden');
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

    /**
     * Persist the lastPreviewedTimestamp to localStorage. This ensures that
     * the chat preview does not repeatedly show messages that were already
     * alerted to the user in previous sessions. The timestamp is stored
     * under a key unique to the current user's UID. Errors accessing
     * localStorage are silently ignored.
     */
    persistLastPreviewedTimestamp() {
      try {
        if (!this.currentUserUid) return;
        const key = `chat_lastPreview_${this.currentUserUid}`;
        const ts = (typeof this.lastPreviewedTimestamp === 'number') ? this.lastPreviewedTimestamp : 0;
        localStorage.setItem(key, String(ts));
      } catch (_e) {
        // Ignore localStorage errors (e.g. quota exceeded)
      }
    }

    /**
     * Load the lastPreviewedTimestamp from localStorage. If no value is
     * found or the value is invalid, the timestamp remains zero. This
     * method should be called after determining the currentUserUid in
     * init() and before any previews may be displayed. Errors
     * accessing or parsing localStorage are silently ignored.
     */
    loadLastPreviewedTimestamp() {
      try {
        if (!this.currentUserUid) return;
        const key = `chat_lastPreview_${this.currentUserUid}`;
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const val = parseInt(raw, 10);
        if (!isNaN(val)) {
          this.lastPreviewedTimestamp = val;
        }
      } catch (_e) {
        // Ignore localStorage errors
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
        const AudioContext = window.AudioContext || window.webkitAudioContext;
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