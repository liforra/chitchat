chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addFriend") {
    const { userId } = request;
    const API_BASE_URL = "https://api.chitchat.gg";

    fetch(`${API_BASE_URL}/users/me/relationships/${userId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 2 })
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        return response.json().then(error => {
          throw new Error(error.message);
        });
      }
    })
    .then(data => {
      sendResponse({ success: true, data });
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });

    return true; // Indicates that the response is sent asynchronously
  }
});