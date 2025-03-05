// PlayEntry Notification Enhancer
// This extension enhances PlayEntry's notification system by adding direct links and read functionality

// Main function to enhance notifications
function enhanceNotifications() {
    console.log('PlayEntry Notification Enhancer active');
    
    // Keep track of current page URL
    let currentUrl = window.location.href;
    
    // Check if we're on the alarm page
    const isAlarmPage = () => window.location.href.includes('/alarm');
    
    // Store the last fetched search cursor for pagination
    let lastSearchAfter = null;
  
    // Function to observe DOM changes and detect the notification popup or changes in the alarm page
    function observeDOM() {
      const targetNode = document.body;
      const config = { childList: true, subtree: true };
  
      // Track URL changes
      setInterval(() => {
        if (currentUrl !== window.location.href) {
          currentUrl = window.location.href;
          console.log('URL changed to:', currentUrl);
          
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
  
    // Function to mark a notification as read
    async function markAsRead(notificationId) {
      try {
        const { csrfToken, xToken } = extractTokens();
        
        await fetch("https://playentry.org/graphql/READ_TOPIC", {
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
        
        console.log(`Marked notification ${notificationId} as read`);
      } catch (error) {
        console.log('Error marking notification as read:', error);
      }
    }
  
    // Function to fetch notifications data from GraphQL API
    async function fetchNotificationData(searchAfter = null) {
      try {
        const { csrfToken, xToken } = extractTokens();
  
        const variables = {
          pageParam: {
            display: 20
          }
        };
        
        // Add searchAfter if we have one for pagination
        if (searchAfter) {
          variables.searchAfter = searchAfter;
        }
  
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
              query SELECT_TOPICS($pageParam: PageParam, $searchAfter: JSON){
                topicList(pageParam: $pageParam, searchAfter: $searchAfter) {
                  searchAfter
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
  
        const data = await response.json();
        
        if (data && data.data && data.data.topicList) {
          lastSearchAfter = data.data.topicList.searchAfter;
          return data.data.topicList.list;
        }
        
        return [];
      } catch (error) {
        console.log('Error fetching notifications data:', error);
        return [];
      }
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
  
        // First, add a direct click handler to each notification item
        // This will send them to the free board as a fallback in case API call fails
        for (const item of notificationItems) {
          item.style.cursor = 'pointer';
          item.onclick = function(event) {
            // Don't interfere with existing click behavior
            if (event.target.tagName === 'A' || event.target.closest('a')) {
              return;
            }
            
            // Default fallback action - go to community main
            window.location.href = 'https://playentry.org/community/free';
          };
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
            
            // Set up click handler for free or suggestion category notifications
            if (notification.link && (notification.link.category === 'free' || notification.link.category === 'suggestion')) {
              item.onclick = async function(event) {
                // Don't interfere with existing click behavior
                if (event.target.tagName === 'A' || event.target.closest('a')) {
                  return;
                }
                
                // Prevent default behavior
                event.preventDefault();
                
                // Mark as read
                await markAsRead(notification.id);
                
                // Go to the appropriate page based on category
                let targetUrl;
                if (notification.link.category === 'free') {
                  targetUrl = `https://playentry.org/community/entrystory/${notification.link.target}`;
                } else if (notification.link.category === 'suggestion') {
                  targetUrl = `https://playentry.org/suggestion/${notification.link.target}`;
                }
                
                window.location.href = targetUrl;
              };
            }
          }
        }
      } catch (error) {
        console.log('Error enhancing notification popup:', error);
      }
    }
  
    // Function to enhance the dedicated alarm page
    async function enhanceAlarmPage() {
      try {
        // Make sure we're on the alarm page
        if (!isAlarmPage()) {
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
  
        // Fetch notification data
        const notifications = await fetchNotificationData(lastSearchAfter);
        
        if (notifications.length > 0) {
          // Associate each unenhanced HTML notification item with notifications
          for (let i = 0; i < Math.min(unenhancedItems.length, notifications.length); i++) {
            const notification = notifications[i];
            const item = unenhancedItems[i];
            
            // Mark this item as enhanced
            item.setAttribute('data-enhanced', 'true');
            
            // Store the notification ID in a data attribute for easy access
            item.dataset.notificationId = notification.id;
            
            // Get the main div element inside dd
            const mainDiv = item.querySelector('div.css-1gx654b, div.css-1rrteue');
            if (!mainDiv) continue;
            
            // Set up click handler for free or suggestion category notifications
            if (notification.link && (notification.link.category === 'free' || notification.link.category === 'suggestion')) {
              // Set cursor to pointer
              mainDiv.style.cursor = 'pointer';
              
              mainDiv.onclick = async function(event) {
                // Don't interfere with existing click behavior
                if (event.target.tagName === 'A' || event.target.closest('a')) {
                  return;
                }
                
                // Prevent default behavior
                event.preventDefault();
                
                // Mark as read
                await markAsRead(notification.id);
                
                // Go to the appropriate page based on category
                let targetUrl;
                if (notification.link.category === 'free') {
                  targetUrl = `https://playentry.org/community/entrystory/${notification.link.target}`;
                } else if (notification.link.category === 'suggestion') {
                  targetUrl = `https://playentry.org/suggestion/${notification.link.target}`;
                }
                
                window.location.href = targetUrl;
              };
            }
          }
        }
      } catch (error) {
        console.log('Error enhancing alarm page:', error);
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