// PlayEntry Notification Enhancer
// This extension enhances PlayEntry's notification system by adding direct links and read functionality

// Main function to enhance notifications
function enhanceNotifications() {
    console.log('PlayEntry Notification Enhancer active');
    
    // Keep track of current page URL
    let currentUrl = window.location.href;
    
    // Check if we're on the alarm page
    const isAlarmPage = () => window.location.href.includes('/alarm');
    
    // Prevent concurrent fetches
    let isFetching = false;
    
    // Retry configuration
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
  
    // Function to observe DOM changes and detect the notification popup or changes in the alarm page
    function observeDOM() {
      const targetNode = document.body;
      const config = { childList: true, subtree: true };
  
      // Track URL changes
      setInterval(() => {
        if (currentUrl !== window.location.href) {
          currentUrl = window.location.href;
          console.log('URL changed to:', currentUrl);
          
          // Reset fetch state when URL changes
          isFetching = false;
          
          // If we're now on the alarm page, enhance it
          if (isAlarmPage()) {
            enhanceAlarmPage();
          }
        }
      }, 1000);
  
      const callback = function(mutationsList, observer) {
        for (const mutation of mutationsList) {
          if (mutation.type === 'childList') {
            // Check if we're on the alarm page
            if (isAlarmPage()) {
              // Check if the notification list is loaded
              const notificationContainer = document.querySelector('dl.css-1vvesx9');
              if (notificationContainer && notificationContainer.querySelectorAll('dd').length > 0) {
                // Debounce the fetching to avoid multiple calls
                clearTimeout(window.fetchTimeout);
                window.fetchTimeout = setTimeout(enhanceAlarmPage, 300);
              }
              
              // Also check for the "more" button
              const moreButton = document.querySelector('div.css-7ndem5');
              if (moreButton && !moreButton.hasAttribute('data-enhanced')) {
                moreButton.setAttribute('data-enhanced', 'true');
                moreButton.addEventListener('click', () => {
                  // When more button is clicked, wait a bit and enhance new notifications
                  setTimeout(enhanceAlarmPage, 1000);
                });
              }
            } else {
              // Check if the notification popup is present for regular pages
              const notificationPopup = document.querySelector('#userAlarmId');
              if (notificationPopup) {
                // Check if the notification list is fully loaded
                const notificationList = document.querySelector('#userAlarmId .css-1wc2sdr');
                if (notificationList && notificationList.querySelectorAll('li').length > 0) {
                  // Debounce the fetching to avoid multiple calls
                  clearTimeout(window.fetchTimeout);
                  window.fetchTimeout = setTimeout(fetchNotifications, 300);
                }
              }
            }
          }
        }
      };
  
      const observer = new MutationObserver(callback);
      observer.observe(targetNode, config);
      
      // Also add a polling mechanism as backup
      setInterval(() => {
        if (isAlarmPage()) {
          const notificationContainer = document.querySelector('dl.css-1vvesx9');
          if (notificationContainer && notificationContainer.querySelectorAll('dd').length > 0) {
            enhanceAlarmPage();
          }
        } else {
          const notificationPopup = document.querySelector('#userAlarmId');
          const notificationList = document.querySelector('#userAlarmId .css-1wc2sdr');
          if (notificationPopup && notificationList && notificationList.querySelectorAll('li').length > 0) {
            fetchNotifications();
          }
        }
      }, 3000); // Check every 3 seconds
    }
  
    // Function to extract tokens from the page
    function extractTokens() {
      // Try to get CSRF token from meta tag
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      // Try to get X-Token from localStorage
      let xToken = '';
      try {
        xToken = localStorage.getItem('playentry_token') || '';
      } catch (e) {
        console.log('Could not access localStorage');
      }

      return { csrfToken, xToken };
    }

    // Function to sleep/wait
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  
    // Function to mark a notification as read with retry logic
    async function markAsRead(notificationId, retryCount = 0) {
      try {
        const { csrfToken, xToken } = extractTokens();
        
        const response = await fetch("https://playentry.org/graphql/READ_TOPIC", {
          "headers": {
            "accept": "*/*",
            "content-type": "application/json",
            ...(csrfToken && { "csrf-token": csrfToken }),
            ...(xToken && { "x-token": xToken }),
            "x-client-type": "Client"
          },
          "body": JSON.stringify({
            query: `
              mutation READ_TOPIC($id: ID!) {
                readTopic(id: $id) {
                  status
                  result
                }
              }
            `,
            variables: {
              id: notificationId
            }
          }),
          "method": "POST",
          "mode": "cors",
          "credentials": "include"
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log(`Marked notification ${notificationId} as read`);
        return true;
      } catch (error) {
        console.log(`Error marking notification as read (attempt ${retryCount + 1}):`, error);
        
        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying in ${RETRY_DELAY}ms...`);
          await sleep(RETRY_DELAY);
          return markAsRead(notificationId, retryCount + 1);
        }
        
        console.log(`Failed to mark notification ${notificationId} as read after ${MAX_RETRIES} attempts`);
        return false;
      }
    }
  
    // Function to fetch notifications data from GraphQL API with retry logic
    async function fetchNotificationData(displayCount = 20, retryCount = 0) {
      try {
        const { csrfToken, xToken } = extractTokens();

        const variables = {
          pageParam: {
            display: displayCount
          }
        };

        const response = await fetch("https://playentry.org/graphql/SELECT_TOPICS", {
          "headers": {
            "accept": "*/*",
            "content-type": "application/json",
            ...(csrfToken && { "csrf-token": csrfToken }),
            ...(xToken && { "x-token": xToken }),
            "x-client-type": "Client"
          },
          "body": JSON.stringify({
            query: `
              query SELECT_TOPICS($pageParam: PageParam){
                topicList(pageParam: $pageParam) {
                  list {
                    id
                    params
                    template
                    thumbUrl
                    category
                    target
                    isRead
                    created
                    updated
                    link {
                      category
                      target
                      hash
                      groupId
                    }
                    topicinfo {
                      category
                      targetId
                    }
                  }
                }
              }
            `,
            variables
          }),
          "method": "POST",
          "mode": "cors",
          "credentials": "include"
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.data && data.data.topicList) {
          return data.data.topicList.list;
        }
        
        throw new Error('Invalid response structure');
      } catch (error) {
        console.log(`Error fetching notifications data (attempt ${retryCount + 1}):`, error);
        
        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying in ${RETRY_DELAY}ms...`);
          await sleep(RETRY_DELAY);
          return fetchNotificationData(displayCount, retryCount + 1);
        }
        
        console.log(`Failed to fetch notifications after ${MAX_RETRIES} attempts`);
        return [];
      }
    }

    // Function to determine the target URL for a notification
    function getNotificationTargetUrl(notification) {
      if (!notification.link) {
        return null;
      }

      // Check if link.target contains a full URL (특별한 경우 처리)
      if (notification.link.target && notification.link.target.startsWith('http')) {
        return notification.link.target;
      }

      // Handle specific categories
      if (notification.link.category === 'free') {
        return `https://playentry.org/community/entrystory/${notification.link.target}`;
      } else if (notification.link.category === 'suggestion') {
        return `https://playentry.org/suggestion/${notification.link.target}`;
      } else if (notification.link.category === 'etc' && notification.link.target) {
        // etc 카테고리에서도 전체 URL이 올 수 있음
        if (notification.link.target.startsWith('http')) {
          return notification.link.target;
        }
      }

      return null;
    }
  
    // Function to fetch notifications and enhance the popup on regular pages
    async function fetchNotifications() {
      try {
        // Get all notification items from the DOM
        const notificationContainer = document.querySelector('#userAlarmId .css-1wc2sdr');
        if (!notificationContainer) {
          return;
        }

        const notificationItems = notificationContainer.querySelectorAll('li');
        if (!notificationItems.length) {
          return;
        }

        // Remove fallback click handlers - don't set default redirect behavior
        for (const item of notificationItems) {
          // Reset any previous handlers
          item.onclick = null;
        }

        // Fetch notification data
        const notifications = await fetchNotificationData();
        
        if (notifications.length > 0) {
          // Associate each HTML notification item with the notifications
          // We're doing a simple 1-to-1 mapping by position
          for (let i = 0; i < Math.min(notificationItems.length, notifications.length); i++) {
            const notification = notifications[i];
            const item = notificationItems[i];
            
            // Store the notification ID in a data attribute for easy access
            item.dataset.notificationId = notification.id;
            
            // Get target URL for this notification
            const targetUrl = getNotificationTargetUrl(notification);
            
            if (targetUrl) {
              // Set cursor to pointer only if we have a valid target
              item.style.cursor = 'pointer';
              
              item.onclick = async function(event) {
                // Don't interfere with existing click behavior
                if (event.target.tagName === 'A' || event.target.closest('a')) {
                  return;
                }
                
                // Prevent default behavior
                event.preventDefault();
                
                // Mark as read (non-blocking)
                markAsRead(notification.id);
                
                // Navigate to target URL
                window.location.href = targetUrl;
              };
            }
          }
        } else {
          console.log('No notification data available - keeping items non-clickable');
        }
      } catch (error) {
        console.log('Error enhancing notification popup:', error);
        // Don't provide fallback navigation on error
      }
    }
  
    // Function to enhance the dedicated alarm page
    async function enhanceAlarmPage() {
      try {
        // Make sure we're on the alarm page
        if (!isAlarmPage()) {
          return;
        }

        // Prevent concurrent fetches
        if (isFetching) {
          return;
        }

        // Get all notification items from the DOM
        const notificationContainer = document.querySelector('dl.css-1vvesx9');
        if (!notificationContainer) {
          return;
        }

        const notificationItems = notificationContainer.querySelectorAll('dd');
        if (!notificationItems.length) {
          return;
        }

        console.log(`Found ${notificationItems.length} notification items on alarm page`);

        // Get only the items that haven't been enhanced yet
        const unenhancedItems = Array.from(notificationItems).filter(item => !item.hasAttribute('data-enhanced'));
        
        if (unenhancedItems.length === 0) {
          return; // All items are already enhanced
        }
        
        console.log(`Enhancing ${unenhancedItems.length} new notification items`);

        isFetching = true;
        try {
          // Fetch notification data for all items in DOM
          const totalItems = notificationItems.length;
          const notifications = await fetchNotificationData(totalItems);
          
          console.log(`Fetched ${notifications.length} notifications for ${totalItems} DOM items`);

          // Enhance all unenhanced items
          for (let i = 0; i < unenhancedItems.length; i++) {
            const item = unenhancedItems[i];
            
            // Find the index of this item in the full notificationItems list
            const itemIndex = Array.from(notificationItems).indexOf(item);
            
            if (itemIndex >= 0 && itemIndex < notifications.length) {
              const notification = notifications[itemIndex];
              
              // Mark this item as enhanced
              item.setAttribute('data-enhanced', 'true');
              
              // Store the notification ID in a data attribute for easy access
              item.dataset.notificationId = notification.id;
              
              // Get the main div element inside dd
              const mainDiv = item.querySelector('div.css-1gx654b, div.css-1rrteue');
              if (!mainDiv) continue;
              
              // Get target URL for this notification
              const targetUrl = getNotificationTargetUrl(notification);
              
              if (targetUrl) {
                // Set cursor to pointer only if we have a valid target
                mainDiv.style.cursor = 'pointer';
                
                mainDiv.onclick = async function(event) {
                  // Don't interfere with existing click behavior
                  if (event.target.tagName === 'A' || event.target.closest('a')) {
                    return;
                  }
                  
                  // Prevent default behavior
                  event.preventDefault();
                  
                  // Mark as read (non-blocking)
                  markAsRead(notification.id);
                  
                  // Navigate to target URL
                  window.location.href = targetUrl;
                };
              }
            } else {
              // Mark as enhanced even if no corresponding notification data
              item.setAttribute('data-enhanced', 'true');
              console.log(`No notification data for item at index ${itemIndex}`);
            }
          }
          
          console.log(`Enhanced ${unenhancedItems.length} items`);
        } catch (error) {
          console.log('Error fetching notifications:', error);
          // Mark items as enhanced even if fetch failed to avoid infinite retries
          for (const item of unenhancedItems) {
            item.setAttribute('data-enhanced', 'true');
          }
        } finally {
          isFetching = false;
        }
      } catch (error) {
        console.log('Error enhancing alarm page:', error);
        isFetching = false;
      }
    }
  
    // Initial check for current page
    if (isAlarmPage()) {
      enhanceAlarmPage();
    } else {
      // Check for notification popup on regular pages
      const notificationPopup = document.querySelector('#userAlarmId');
      if (notificationPopup) {
        fetchNotifications();
      }
    }
  
    // Start observing DOM changes
    observeDOM();
  }
  
  // Run the function when the page is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceNotifications);
  } else {
    enhanceNotifications();
  }