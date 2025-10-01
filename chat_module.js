// Chat Module for internal messaging with group and private channels
// This module dynamically creates a chat UI within the application once a user logs in.
// It manages online presence, group chat, and one‑to‑one private chat using Firebase Realtime Database.

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
      // Store the callback for the currently active message listener. This is
      // needed so that we can detach only the specific callback when
      // switching channels instead of removing all listeners on the same
      // reference (which would inadvertently remove other listeners such as
      // those used for last message tracking). See listenToMessages() for
      // details.
      this.currentMessageCallback = null;
      this.dragOffset = { x: 0, y: 0 };
      this.isDragging = false;
      // Store all clinic users passed from the main system. This list will be used
      // to populate the user list on the left. Defaults to an empty array.
      this.usersList = [];
      // Track the last message timestamp for each channel (public or private chat).
      this.lastMessageTime = {};
      // Store references to last message listeners keyed by channelId for cleanup.
      this.channelListeners = {};
      // Handler for beforeunload event to remove presence on window unload.
      this.beforeUnloadHandler = null;
      // Bindings for last message handling
      this.updateUserListOrder = this.updateUserListOrder.bind(this);
      this.attachLastMessageListeners = this.attachLastMessageListeners.bind(this);

      // Track when each channel (public or private) was last read by the current
      // user. This helps determine whether a channel has unread messages.
      // Keys correspond to channel IDs ("public" or sorted UID pair). Values
      // are timestamps of the last message the user has viewed in that channel.
      this.lastSeenTime = {};

      // Bind persistence helpers to this context. These helpers load and
      // persist the last seen timestamps to localStorage keyed by user UID.
      this.loadLastSeenTimes = this.loadLastSeenTimes.bind(this);
      this.persistLastSeenTimes = this.persistLastSeenTimes.bind(this);

      // References and listeners for monitoring Firebase connection status. When
      // the connection state changes (e.g. goes offline or comes back
      // online), we re-apply presence onDisconnect handlers and update our
      // presence entry accordingly. These will be assigned in setupPresence()
      // and detached in destroy().
      this.connectionRef = null;
      this.connectionListener = null;

      // Indicator element on the chat toggle button to show new unread
      // messages across all channels. This small red dot is appended to the
      // chat button in createUI() and toggled visible/hidden in
      // updateNewMessageIndicators().
      this.chatNotificationIndicator = null;

      // Track the timestamp of the latest unread message that has already
      // triggered a notification sound. This prevents multiple sounds
      // playing for the same unread messages. When a newer message arrives
      // while the chat popup is hidden, the notification sound will play
      // again and this value will update.
      this.lastNotificationTimestamp = 0;

      // Track the timestamp (in milliseconds) of the last notification sound
      // played. This is used to throttle the sound so that it plays at
      // most once every 10 seconds when new messages arrive. When the
      // difference between the current time and this value exceeds the
      // defined interval, a new sound can be played.
      this.lastSoundTime = 0;
    }

    /**
     * Initialize the chat system for the current user. This should be called
     * once after the user logs in. Subsequent calls will be ignored unless
     * the module was destroyed via destroy().
     *
     * @param {Object} userData - The current user's data object.
     */
    init(userData, usersList) {
      if (this.initialized) return;
      if (!userData) return;
      // Determine UID: prefer userData.uid, fallback to Firebase auth currentUser
      const auth = window.firebase && window.firebase.auth;
      const currentAuthUser = auth && auth.currentUser ? auth.currentUser : null;
      this.currentUserUid = userData.uid || (currentAuthUser ? currentAuthUser.uid : null);
      if (!this.currentUserUid) {
        console.warn('ChatModule: Unable to determine UID for current user. Chat will not initialize.');
        return;
      }
      this.currentUser = userData;
      this.initialized = true;
      // Store users list if provided; fallback to global if available
      if (usersList && Array.isArray(usersList)) {
        this.usersList = usersList;
      } else if (Array.isArray(window.users)) {
        this.usersList = window.users;
      }

      // Load last seen times from localStorage so that unread indicators
      // respect previously viewed messages across sessions. This must be
      // called after currentUserUid is determined and before any listeners
      // update lastSeenTime.
      try {
        this.loadLastSeenTimes();
      } catch (_e) {
        // Ignore errors loading last seen times
      }
      // Also fetch last seen times from the Realtime Database. This call is
      // asynchronous and will merge any remote data with the locally loaded
      // timestamps. We intentionally do not await the promise here so that
      // chat initialization can continue without delay. When the data is
      // retrieved, unread indicators will update automatically.
      try {
        if (typeof this.loadLastSeenTimesRemote === 'function') {
          this.loadLastSeenTimesRemote();
        }
      } catch (_e) {
        // Ignore remote loading errors; offline usage will still work
      }
      this.createUI();
      this.setupPresence();
      this.populateUserList();
      this.listenToPresence();
      // Set up listeners for last message times and start listening to public channel by default
      this.attachLastMessageListeners();
      this.listenToMessages('public');
    }

    /**
     * Clean up event listeners, remove UI elements, and unregister presence
     * before the user logs out. After calling destroy(), init() can be
     * invoked again on the next login.
     */
    destroy() {
      if (!this.initialized) return;
      // Remove presence listener
      try {
        if (this.presenceRootRef && this.presenceListener) {
          window.firebase.off(this.presenceRootRef, 'value', this.presenceListener);
        }
      } catch (err) {
        console.error('ChatModule: error detaching presence listener', err);
      }
      this.presenceRootRef = null;
      this.presenceListener = null;
      // Remove messages listener
      try {
        if (this.messagesRef) {
          window.firebase.off(this.messagesRef, 'value');
        }
      } catch (err) {
        console.error('ChatModule: error detaching messages listener', err);
      }
      this.messagesRef = null;
      // Mark presence as offline instead of removing the entry completely
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
      // Detach connection status listener
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
      // Detach last message listeners
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
      this.channelListeners = {};
      this.lastMessageTime = {};
      // Remove beforeunload handler
      if (this.beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
      // Remove UI elements and event listeners
      if (this.chatButton) {
        this.chatButton.removeEventListener('click', this.togglePopupHandler);
        this.chatButton.remove();
        this.chatButton = null;
      }
      if (this.chatPopup) {
        // Remove listeners added on header for dragging
        const header = this.chatPopup.querySelector('.chat-header');
        if (header) {
          header.removeEventListener('mousedown', this.startDragHandler);
        }
        // Remove send message events
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

    /**
     * Create the chat toggle button and chat popup DOM elements.
     */
    createUI() {
      // Chat toggle button
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

      // Add a small red dot indicator to the chat toggle button. This
      // notification dot will be shown when there are unread messages and
      // the chat popup is hidden. Use absolute positioning relative to
      // the button. The dot is hidden by default.
      button.classList.add('relative');
      const notifDot = document.createElement('span');
      this.chatNotificationIndicator = notifDot;
      notifDot.className = 'absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 hidden';
      // Offset the dot so it sits slightly outside the button's boundary.
      notifDot.style.transform = 'translate(50%,-50%)';
      button.appendChild(notifDot);
      // Handler bound to this for removal later
      this.togglePopupHandler = () => this.togglePopup();
      button.addEventListener('click', this.togglePopupHandler);

      // Chat popup
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
      // Enable resizing of the popup
      popup.style.resize = 'both';
      popup.style.overflow = 'hidden';

      // Header
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

      // Content area: user list + messages
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'flex flex-1 overflow-hidden';
      // User list
      const userList = document.createElement('div');
      this.userListContainer = userList;
      userList.className = 'w-1/3 border-r overflow-y-auto';
      popup.appendChild(contentWrapper);
      // messages container
      const messagesWrapper = document.createElement('div');
      messagesWrapper.className = 'flex-1 flex flex-col';
      // Message display
      const messageList = document.createElement('div');
      this.messageContainer = messageList;
      messageList.className = 'flex-1 overflow-y-auto p-2 space-y-2 bg-white';
      // Input area
      const inputArea = document.createElement('div');
      inputArea.className = 'p-2 border-t bg-gray-50';
      // Textarea
      const textarea = document.createElement('textarea');
      this.messageInput = textarea;
      textarea.className = 'w-full border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring focus:border-blue-300';
      textarea.rows = 2;
      textarea.maxLength = 500;
      textarea.placeholder = '輸入訊息...';
      // Character count
      const charCounter = document.createElement('div');
      this.charCount = charCounter;
      charCounter.className = 'text-xs text-gray-400 text-right pt-1';
      charCounter.textContent = '0/500';
      // Send button
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

      // Bind event handlers for dragging
      this.startDragHandler = (ev) => {
        this.isDragging = true;
        // Calculate offset between mouse and top left corner of popup
        const rect = this.chatPopup.getBoundingClientRect();
        this.dragOffset.x = ev.clientX - rect.left;
        this.dragOffset.y = ev.clientY - rect.top;
        // Set event listeners on document for dragging and releasing
        document.addEventListener('mousemove', this.dragHandler);
        document.addEventListener('mouseup', this.stopDragHandler);
      };
      this.dragHandler = (ev) => {
        if (!this.isDragging) return;
        // Move popup relative to viewport
        const newLeft = ev.clientX - this.dragOffset.x;
        const newTop = ev.clientY - this.dragOffset.y;
        // Ensure popup stays within window boundaries
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

      // Input handling
      this.inputHandler = () => {
        const text = this.messageInput.value;
        this.charCount.textContent = `${text.length}/500`;
        this.sendButton.disabled = text.trim().length === 0;
        // Auto-resize textarea height
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
      // Send button
      this.sendHandler = () => {
        this.sendMessage();
      };
      this.sendButton.addEventListener('click', this.sendHandler);
    }

    /**
     * Show or hide the chat popup when the toggle button is clicked.
     */
    togglePopup() {
      // Toggle the chat popup visibility. When opening the popup, scroll
      // the message container to the bottom so that the newest messages are
      // visible immediately. This ensures that each time the user opens a
      // conversation, the latest messages are in view.
      const wasHidden = this.chatPopup.classList.contains('hidden');
      if (wasHidden) {
        this.chatPopup.classList.remove('hidden');
        // Scroll to bottom after opening
        if (this.messageContainer) {
          try {
            this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
          } catch (_e) {
            // Ignore scroll errors
          }
        }
      } else {
        this.chatPopup.classList.add('hidden');
      }
      // Update the new message indicators whenever the popup visibility
      // changes so that the notification dot on the chat button hides when
      // the chat is open and shows only when closed and unread messages exist.
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    /**
     * Register the current user as online and set up onDisconnect removal.
     */
    setupPresence() {
      try {
        // Each user has its own presence entry under presence/<uid>
        this.presenceRef = window.firebase.ref(window.firebase.rtdb, `presence/${this.currentUserUid}`);
        // Monitor connection status via the special .info/connected path. When the client
        // transitions from offline to online, re-apply the onDisconnect handler and
        // set presence to online. Without this, the presence may remain offline
        // after a reconnect. See Firebase presence docs for details.
        this.connectionRef = window.firebase.ref(window.firebase.rtdb, '.info/connected');
        this.connectionListener = (snapshot) => {
          const isConnected = !!snapshot.val();
          if (isConnected) {
            try {
              // Setup onDisconnect handler to mark the user offline on unexpected disconnect.
              if (this.presenceRef && window.firebase.onDisconnect) {
                // Call onDisconnect before setting presence to avoid race conditions【90900164263754†L107-L111】.
                window.firebase.onDisconnect(this.presenceRef).set({
                  online: false,
                  lastSeen: Date.now()
                });
              }
            } catch (err) {
              console.warn('ChatModule: Failed to set onDisconnect for presence', err);
            }
            // Immediately mark the user as online with a lastSeen timestamp. This will
            // run each time the connection comes online. Any error here is logged.
            window.firebase.set(this.presenceRef, {
              online: true,
              lastSeen: Date.now()
            }).catch((err) => {
              console.error('ChatModule: Failed to set presence', err);
            });
          }
        };
        window.firebase.onValue(this.connectionRef, this.connectionListener);

        // When the page unloads or the user leaves explicitly, set presence to offline
        this.beforeUnloadHandler = () => {
          try {
            if (this.presenceRef) {
              window.firebase.set(this.presenceRef, {
                online: false,
                lastSeen: Date.now()
              });
            }
          } catch (_e) {
            // Ignore errors during unload
          }
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
      } catch (err) {
        console.error('ChatModule: Error in setupPresence', err);
      }
    }

    /**
     * Populate the user list on the left side of the chat. Includes an entry
     * for the group chat (public) followed by each user except the current one.
     */
    populateUserList() {
      // Clear existing entries
      this.userListContainer.innerHTML = '';
      // Helper to create an item
        const createItem = (userObj, isGroup = false) => {
        const item = document.createElement('div');
        item.className = 'flex items-center px-3 py-2 cursor-pointer hover:bg-gray-100';
        item.dataset.uid = userObj.uid || '';
        // Avatar: first letter
        const avatar = document.createElement('div');
        avatar.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mr-2 flex-shrink-0';
        if (isGroup) {
          avatar.textContent = '#';
          avatar.style.backgroundColor = '#6B7280'; // gray
        } else {
          // Avatar shows first character of name or username
          const nameSource = userObj.name || userObj.username || '?';
          const firstChar = nameSource.charAt(0);
          avatar.textContent = firstChar;
          // Choose a color based on uid
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
        // Name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'flex-1 text-sm truncate';
        nameSpan.textContent = isGroup ? '主頻道' : (userObj.name || userObj.username || '未知用戶');
        // Status dot
        const statusDot = document.createElement('span');
        statusDot.className = 'w-2 h-2 rounded-full ml-2 flex-shrink-0';
        statusDot.style.backgroundColor = isGroup ? 'transparent' : '#9CA3AF'; // default gray
        statusDot.dataset.statusDot = 'true';
        item.appendChild(avatar);
        item.appendChild(nameSpan);
        item.appendChild(statusDot);

        // A small red dot to indicate unread messages. By default hidden. The
        // indicator will be toggled on or off based on whether there are
        // unseen messages for this channel. It uses a data attribute so it can
        // be queried later without storing separate references.
        const newIndicator = document.createElement('span');
        newIndicator.dataset.newIndicator = 'true';
        // Use Tailwind utility-like classes for size and shape. Hidden by
        // default; will be shown when there are unread messages.
        newIndicator.className = 'ml-auto w-2 h-2 rounded-full bg-red-500 hidden';
        item.appendChild(newIndicator);
        // Click handler
        item.addEventListener('click', () => {
          // Remove highlight from previous selection
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
      // Group chat item
      const groupItem = createItem({ username: '主頻道', uid: 'public' }, true);
      groupItem.classList.add('bg-blue-100'); // default selected
      this.userListContainer.appendChild(groupItem);
      // Other users
      const list = Array.isArray(this.usersList) ? this.usersList : [];
      list.forEach(u => {
        if (!u) return;
        // Exclude current user (by uid or id)
        const uid = u.uid || u.id || null;
        if (!uid) return;
        if (uid === this.currentUserUid || String(uid) === String(this.currentUser.id)) return;
        const userItem = createItem(u, false);
        this.userListContainer.appendChild(userItem);
      });
    }

    /**
     * Listen to presence changes for all users and update status dots.
     */
    listenToPresence() {
      try {
        this.presenceRootRef = window.firebase.ref(window.firebase.rtdb, 'presence');
        this.presenceListener = (snapshot) => {
          const presenceData = snapshot.val() || {};
          // Count online users excluding current (for potential use)
          let onlineCount = 0;
          Object.keys(presenceData).forEach(uid => {
            const entry = presenceData[uid];
            // Determine online status based on the structure of the entry.
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
          // Update status dots
          const items = this.userListContainer.querySelectorAll('div[data-uid]');
          items.forEach(item => {
            const uid = item.dataset.uid;
            const dot = item.querySelector('span[data-status-dot="true"]');
            if (!dot) return;
            // Skip the public (group) channel. Its status dot should remain
            // transparent rather than being forced to gray or green.
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
              dot.style.backgroundColor = '#10B981'; // green
            } else {
              dot.style.backgroundColor = '#9CA3AF'; // gray
            }
          });
        };
        window.firebase.onValue(this.presenceRootRef, this.presenceListener);
      } catch (err) {
        console.error('ChatModule: Failed to listen to presence', err);
      }
    }

    /**
     * Switch to the public (group) chat channel.
     */
    selectPublicChannel() {
      this.currentChannel = 'public';
      this.privateChatId = null;
      this.channelLabel.textContent = '主頻道';
      this.listenToMessages('public');

      // Mark messages in the public channel as read by setting the last seen
      // timestamp to the latest message time or now. This prevents the new
      // message indicator from showing while the user is in the channel.
      const ts = this.lastMessageTime['public'] || Date.now();
      this.lastSeenTime['public'] = ts;
      // Persist the last seen time so red dot remains hidden across sessions
      if (typeof this.persistLastSeenTimes === 'function') {
        this.persistLastSeenTimes();
      }
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    /**
     * Switch to a private chat with the specified user.
     *
     * @param {Object} userObj - User object representing the other participant.
     */
    selectPrivateChat(userObj) {
      if (!userObj) return;
      const uid = userObj.uid || userObj.id;
      if (!uid) return;
      // Create a deterministic chat ID by sorting the UIDs alphabetically
      const ids = [String(this.currentUserUid), String(uid)].sort();
      const chatId = ids.join('_');
      this.privateChatId = chatId;
      this.currentChannel = 'private';
      // Update channel label to user name
      this.channelLabel.textContent = userObj.name || userObj.username || '私人聊天';
      this.listenToMessages(chatId);

      // Mark messages in this private channel as read. Use the last known
      // message timestamp or current time as the last seen timestamp. This
      // ensures the unread indicator resets when switching into the chat.
      const last = this.lastMessageTime[chatId] || Date.now();
      this.lastSeenTime[chatId] = last;
      // Persist the last seen time for this private chat
      if (typeof this.persistLastSeenTimes === 'function') {
        this.persistLastSeenTimes();
      }
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    /**
     * Attach a listener to messages in the specified channel. Automatically
     * removes any previous listener to avoid duplicate callbacks.
     *
     * @param {string} channelId - 'public' for group chat or chat ID for private.
     */
    listenToMessages(channelId) {
      // Detach the previous message listener. It's important to only remove
      // the specific callback that was registered for the previous channel.
      // Calling off(ref, 'value') without a callback removes *all* value
      // listeners on that reference, which would break other listeners such
      // as those used for tracking the last message of each chat. By
      // storing the callback in `this.currentMessageCallback` we can detach
      // precisely the old listener without affecting others.
      if (this.messagesRef && this.currentMessageCallback) {
        try {
          window.firebase.off(this.messagesRef, 'value', this.currentMessageCallback);
        } catch (err) {
          console.error('ChatModule: error detaching old message listener', err);
        }
      }
      // Determine path for the new channel
      let path;
      if (channelId === 'public') {
        path = 'chat/messages/public';
      } else {
        path = `chat/private/${channelId}`;
      }
      // 取出最後 100 筆訊息，以降低讀取量。若訊息較少則會全部返回
      const baseRef = window.firebase.ref(window.firebase.rtdb, path);
      const q = window.firebase.query(baseRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(100));
      this.messagesRef = q;
      // Define the callback outside of onValue so we can detach it later.
      this.currentMessageCallback = (snapshot) => {
        const data = snapshot.val() || {};
        const messages = Object.values(data);
        // Sort messages so that oldest come first (ascending by timestamp). Newer messages will appear at the bottom.
        messages.sort((a, b) => {
          const ta = a.timestamp || 0;
          const tb = b.timestamp || 0;
          return ta - tb;
        });
        // Render sorted messages
        this.renderMessages(messages);
        // Track latest timestamp for this channel to update ordering of user list
        let latestTs = 0;
        messages.forEach((msg) => {
          const ts = msg.timestamp || 0;
          if (ts > latestTs) latestTs = ts;
        });
        this.lastMessageTime[channelId] = latestTs;
        // If the user is currently viewing this channel and the chat popup is visible,
        // update lastSeenTime so that unread indicators reset. When the chat
        // popup is hidden, do not mark messages as read in the selected channel
        // so that notifications will be shown when new messages arrive while
        // the popup is closed.
        try {
          let isCurrent = false;
          if (this.currentChannel === 'public' && channelId === 'public') {
            isCurrent = true;
          } else if (this.currentChannel === 'private' && this.privateChatId && channelId === this.privateChatId) {
            isCurrent = true;
          }
          // Determine if the chat popup is hidden
          const popupHidden = (this.chatPopup && this.chatPopup.classList.contains('hidden'));
          if (isCurrent && !popupHidden) {
            this.lastSeenTime[channelId] = latestTs;
            // Persist last seen time when actively viewing this channel
            if (typeof this.persistLastSeenTimes === 'function') {
              this.persistLastSeenTimes();
            }
          }
        } catch (_e) {
          // ignore errors during lastSeen update
        }
        // Reorder user list if available
        if (typeof this.updateUserListOrder === 'function') {
          this.updateUserListOrder();
        }
      };
      // Listen to the limited message list
      window.firebase.onValue(this.messagesRef, this.currentMessageCallback);
    }

    /**
     * Render messages in the chat area. Styles the messages depending on
     * whether the current user sent the message.
     *
     * @param {Array} messages - Array of message objects.
     */
    renderMessages(messages) {
      if (!this.messageContainer) return;
      this.messageContainer.innerHTML = '';
      const fragment = document.createDocumentFragment();
      messages.forEach(msg => {
        const isSelf = (msg.senderId === this.currentUserUid);
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-start space-x-2 ' + (isSelf ? 'justify-end' : '');
        // Avatar (optional) only show for other users
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
        // Content container
        const content = document.createElement('div');
        content.className = 'flex flex-col max-w-[70%]';
        // Name and time row
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
        // Message bubble
        const bubble = document.createElement('div');
        bubble.className = (isSelf ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800') + ' rounded-2xl px-3 py-2 text-sm break-words';
        bubble.textContent = msg.text || '';
        content.appendChild(header);
        content.appendChild(bubble);
        wrapper.appendChild(content);
        if (isSelf) {
          // For self messages, show avatar on the right
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
      // Auto-scroll to bottom so that the newest messages (last in array) are visible
      try {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
      } catch (_e) {
        // silently ignore scroll errors
      }
    }

    /**
     * Format a timestamp into HH:mm format. Falls back gracefully if input
     * is invalid.
     *
     * @param {number|string} ts - Timestamp in milliseconds since epoch.
     * @returns {string} Formatted time string.
     */
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

    /**
     * Send the current message input to the appropriate chat channel. Clears
     * the input on success and updates the character counter.
     */
    sendMessage() {
      const text = (this.messageInput && this.messageInput.value) ? this.messageInput.value.trim() : '';
      if (!text) return;
      const timestamp = Date.now();
      const messageData = {
        senderId: this.currentUserUid,
        // Use the clinic user's managed name if available
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
      // Use timestamp as key for uniqueness; each client writes to its own key
      const msgRef = window.firebase.ref(window.firebase.rtdb, `${path}/${timestamp}`);
      window.firebase.set(msgRef, messageData).then(() => {
        // Clear input
        this.messageInput.value = '';
        this.charCount.textContent = '0/500';
        this.sendButton.disabled = true;
        // Reset textarea height
        this.messageInput.style.height = 'auto';

        // Since the user has just sent a message, mark this channel as read by
        // recording the timestamp. Use the timestamp of the sent message so
        // that new messages from other channels can still produce indicators.
        const channelId = (this.currentChannel === 'public') ? 'public' : this.privateChatId;
        if (channelId) {
          this.lastSeenTime[channelId] = timestamp;
          if (typeof this.updateNewMessageIndicators === 'function') {
            this.updateNewMessageIndicators();
          }

          // Persist updated lastSeenTime so that read status remains after reload
          if (typeof this.persistLastSeenTimes === 'function') {
            this.persistLastSeenTimes();
          }
        }
      }).catch((err) => {
        console.error('ChatModule: failed to send message', err);
      });
    }

    /**
     * Attach listeners to the last message of each channel (public and each private chat).
     * This allows the user list to be sorted by the most recently active conversations.
     * The listeners will update this.lastMessageTime and trigger updateUserListOrder().
     */
    attachLastMessageListeners() {
      // Detach any existing listeners first
      try {
        if (this.channelListeners) {
          Object.values(this.channelListeners).forEach(({ ref, callback }) => {
            if (ref && callback) {
              // Remove 'value' listener on this ref for the stored callback
              window.firebase.off(ref, 'value', callback);
            }
          });
        }
      } catch (_err) {
        console.error('ChatModule: error detaching channel listeners', _err);
      }
      this.channelListeners = {};
      // Always watch the public chat
      try {
        const publicRef = window.firebase.ref(window.firebase.rtdb, 'chat/messages/public');
        // 使用 limitToLast(1) 查詢只監聽最後一則訊息，減少讀取量
        const publicQuery = window.firebase.query(publicRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(1));
        const publicCallback = (snapshot) => {
          // 由於查詢只回傳最後一筆資料，直接取其中的 timestamp 即可
          let latest = 0;
          snapshot.forEach((child) => {
            const msg = child.val() || {};
            const ts = msg.timestamp || 0;
            if (ts > latest) latest = ts;
          });
          this.lastMessageTime['public'] = latest;
          if (typeof this.updateUserListOrder === 'function') {
            this.updateUserListOrder();
          }
        };
        window.firebase.onValue(publicQuery, publicCallback);
        this.channelListeners['public'] = { ref: publicQuery, callback: publicCallback };
      } catch (err) {
        console.error('ChatModule: Failed to attach last message listener for public', err);
      }
      // Watch each private chat corresponding to other users
      try {
        const list = Array.isArray(this.usersList) ? this.usersList : [];
        list.forEach((u) => {
          if (!u) return;
          const uid = u.uid || u.id;
          if (!uid) return;
          // Skip current user
          if (String(uid) === String(this.currentUserUid) || String(uid) === String(this.currentUser && this.currentUser.id)) return;
          const chatId = [String(this.currentUserUid), String(uid)].sort().join('_');
          const path = `chat/private/${chatId}`;
          const baseRef = window.firebase.ref(window.firebase.rtdb, path);
          // 查詢最後一則訊息
          const q = window.firebase.query(baseRef, window.firebase.orderByChild('timestamp'), window.firebase.limitToLast(1));
          const cb = (snapshot) => {
            let latest = 0;
            snapshot.forEach((child) => {
              const msg = child.val() || {};
              const ts = msg.timestamp || 0;
              if (ts > latest) latest = ts;
            });
            this.lastMessageTime[chatId] = latest;
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

      // Initial update of unread message indicators. Without this call, the
      // indicators may not be shown on first render before messages are loaded.
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    /**
     * Sort the user list based on the most recent message timestamp for each channel.  
     * Channels with newer messages will appear first. The currently selected channel
     * maintains its highlight after reordering.
     */
    updateUserListOrder() {
      if (!this.userListContainer) return;
      const items = Array.from(this.userListContainer.children);
      if (!items || items.length === 0) return;
      // Identify the currently selected item (highlight class)
      let selectedUid = null;
      items.forEach((item) => {
        if (item.classList.contains('bg-blue-100')) {
          selectedUid = item.dataset.uid;
        }
      });
      // Sort items by last message time descending (most recent first)
      items.sort((a, b) => {
        const uidA = a.dataset.uid;
        const uidB = b.dataset.uid;
        // Determine channel IDs for A and B
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
      // Append sorted items back to container
      items.forEach((item) => {
        this.userListContainer.appendChild(item);
      });
      // Restore the selected highlight class
      items.forEach((item) => {
        if (selectedUid && item.dataset.uid === selectedUid) {
          item.classList.add('bg-blue-100');
        } else {
          item.classList.remove('bg-blue-100');
        }
      });

      // After reordering, update unread message indicators to reflect the
      // latest message times and read statuses. Without this call, the
      // indicator elements may not accurately represent unread counts when
      // items move positions.
      if (typeof this.updateNewMessageIndicators === 'function') {
        this.updateNewMessageIndicators();
      }
    }

    /**
     * Update the unread message indicators on the user list. For each user (or
     * the public channel), determine whether the last message timestamp is
     * greater than the timestamp the current user last viewed messages in
     * that channel. If so, show a small red dot; otherwise hide it. The
     * indicator is always hidden for the currently selected channel since the
     * user is already viewing it. This method should be invoked whenever
     * lastMessageTime or lastSeenTime changes or the user switches channels.
     */
    updateNewMessageIndicators() {
      if (!this.userListContainer) return;
      // Determine whether the chat popup is currently hidden. When the chat
      // is hidden, messages in the currently selected channel should still
      // be considered unread for the purpose of showing indicators. When
      // the chat is visible, messages in the current channel are treated
      // as read and thus indicators are hidden.
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
        // Hide indicator on the currently selected channel only when the chat popup is visible.
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

      // Also update the indicator on the chat toggle button itself. This dot
      // should be visible if there are any unread messages across all
      // channels and the chat popup is currently hidden. The chat popup
      // being hidden ensures that the user sees the red dot when not
      // actively viewing the chat. When the chat is open, the dot should
      // always be hidden.
      if (this.chatNotificationIndicator) {
        let hasUnread = false;
        // Track the latest timestamp of unread messages across all channels.
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
          // Skip currently selected channel only if chat popup is visible. When
          // the chat is hidden, include the current channel in unread checks so
          // that notifications can be shown even if the user had selected that
          // chat before closing the popup.
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
        // Determine whether the notification dot is currently visible
        const indicatorVisible = !this.chatNotificationIndicator.classList.contains('hidden');
        // Only show the dot and play sound if there are unread messages and the popup is hidden
        if (hasUnread && this.chatPopup && this.chatPopup.classList.contains('hidden')) {
          // Show dot
          this.chatNotificationIndicator.classList.remove('hidden');
          // If a newer unread message is detected (timestamp greater than last recorded)
          if (latestUnreadTs > (this.lastNotificationTimestamp || 0)) {
            // Always update the last notification timestamp to the latest unread message time
            this.lastNotificationTimestamp = latestUnreadTs;
            // Determine if enough time has passed since the last sound (10 seconds)
            const now = Date.now();
            const intervalMs = 10000;
            if ((now - (this.lastSoundTime || 0)) >= intervalMs) {
              // Play notification sound and update last sound time
              if (typeof this.playNotificationSound === 'function') {
                this.playNotificationSound();
              }
              this.lastSoundTime = now;
            }
          }
        } else {
          // Hide dot when there are no unread messages or the popup is visible.
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