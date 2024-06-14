let ws;
let localStream;
let peerConnection;
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
let username = "";

document.getElementById("joinButton").onclick = async function () {
  username = document.getElementById("usernameInput").value;
  const roomId = document.getElementById("roomIdInput").value;

  if (!username || !roomId) {
    alert("Please enter both username and room ID.");
    return;
  }

  ws = new WebSocket("ws://localhost:8080/signal/" + roomId);

  ws.onopen = function () {
    // console.log("Connected to signaling server for room " + roomId);
    document.getElementById("messageInput").disabled = false;
    document.getElementById("sendButton").disabled = false;
    document.getElementById("fileInput").disabled = false;
    document.getElementById("sendFileButton").disabled = false;
    initLocalStream();
  };

  ws.onmessage = function (message) {
    // console.log("Received message:", message);
    const data = JSON.parse(message.data);
    // console.log("Received message:", data);

    if (data.type === "offer") {
      handleOffer(data.offer, data.username);
    } else if (data.type === "answer") {
      handleAnswer(data.answer);
    } else if (data.type === "candidate") {
      handleCandidate(data.candidate);
    } else if (data.type === "message") {
      displayMessage(data.username, data.message);
    } else if (data.type === "file") {
    //   console.log(`Received file from ${data.username}: ${data.fileName}`);
      receiveFile(data);
    }
  };

  ws.onclose = function () {
    // console.log("Disconnected from signaling server");
    document.getElementById("messageInput").disabled = true;
    document.getElementById("sendButton").disabled = true;
    document.getElementById("fileInput").disabled = true;
    document.getElementById("sendFileButton").disabled = true;
  };

  ws.onerror = function (error) {
    console.error("WebSocket error:", error);
  };

  document.getElementById("sendButton").onclick = function () {
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value;

    const data = {
      type: "message",
      username: username,
      message: message,
    };

    ws.send(JSON.stringify(data));
    // console.log("Sent message: " + JSON.stringify(data));
    displayMessage("Me", message);

    messageInput.value = "";
  };

  document.getElementById("sendFileButton").onclick = async function () {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a file to send.");
        return;
    }

    const chunkSize = 1000; // Adjust the chunk size as needed
    const totalChunks = Math.ceil(file.size / chunkSize); // Calculate total chunks accurately

    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function (event) {
                const arrayBuffer = event.target.result;
                const base64Data = arrayBufferToBase64(arrayBuffer); // Convert ArrayBuffer to base64 string
                resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const sendChunks = async (base64Data) => {
        let offset = 0;
        let currentChunk = 0;

        while (offset < base64Data.length) {
            currentChunk++;
            const chunk = base64Data.slice(offset, offset + chunkSize);
            const isLastChunk = (offset + chunkSize) >= base64Data.length;

            const data = {
                type: "file",
                username: username, // Assuming 'username' is defined elsewhere in your application.
                fileName: file.name,
                fileData: chunk,
                currentChunk: isLastChunk ? -1 : currentChunk, // -1 for the last chunk if needed
            };

            // console.log(`Sending chunk ${currentChunk} of size ${chunk.length} of ${totalChunks}`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            } else {
                console.error("WebSocket is not open.");
                break;
            }

            offset += chunkSize;
        }
    };

    try {
        const base64Data = await readFileAsBase64(file);
        await sendChunks(base64Data);
        // console.log("File sent successfully.");
        displayFile("Me", file.name, base64Data);
    } catch (error) {
        console.error("Error reading file as Base64:", error);
    }
};

// Helper function to convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

  
};

async function initLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("localVideo").srcObject = localStream;
    initPeerConnection();
  } catch (error) {
    console.error("Error accessing media devices.", error);
  }
}

const sendOffer = async () => {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const data = {
      type: "offer",
      offer: peerConnection.localDescription,
      username: username,
    };

    ws.send(JSON.stringify(data));
    // console.log("Sent offer:", data);
  } catch (error) {
    console.error("Error sending offer:", error);
  }
};

async function initPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

//   console.log("Created RTCPeerConnection with configuration: ", configuration);

  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  sendOffer();

  peerConnection.onicecandidate = function (event) {
    // console.log("Received local ICE candidate:", event.candidate);
    if (event.candidate) {
      ws.send(
        JSON.stringify({ type: "candidate", candidate: event.candidate })
      );
    }
  };

  peerConnection.oniceconnectionstatechange = function (event) {
    // console.log(
    //   "ICE connection state change:",
    //   peerConnection.iceConnectionState
    // );
  };

  peerConnection.ontrack = function (event) {
    // console.log("Received remote track:", event.streams[0]);
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };
}

async function handleOffer(offer, username) {
//   console.log("Received offer from " + username);
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(
      JSON.stringify({ type: "answer", answer: answer, username: username })
    );
  } catch (error) {
    console.error("Error handling offer:", error);
  }
}

async function handleAnswer(answer) {
//   console.log("Received answer");
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  } catch (error) {
    console.error("Error handling answer:", error);
  }
}

function handleCandidate(candidate) {
//   console.log("Received ICE candidate");
  try {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("Error handling ICE candidate:", error);
  }
}

function displayMessage(username, message) {
  const messageDiv = document.createElement("div");
  messageDiv.textContent = `${username}: ${message}`;
  document.getElementById("messages").appendChild(messageDiv);
}

function displayFile(username, fileName, fileData) {
  const fileDiv = document.createElement("div");
  const link = document.createElement("a");
  link.href = "data:application/octet-stream;base64," + fileData;
  link.download = fileName;
  link.textContent = `${username} sent a file: ${fileName}`;
  fileDiv.appendChild(link);
  document.getElementById("messages").appendChild(fileDiv);
}

async function receiveFile(data) {
    // console.log("Received file data:", data);
  
    const { username, fileName, currentChunk, fileData } = data;
  
    // Check for null or undefined values in received data
    if (!username || !fileName || !currentChunk || fileData === null || fileData === undefined) {
    //   console.error("Received invalid file data:", data);
      return;
    }
  
    // Initialize or append to existing file chunks
    if (!receiveFile.receivedChunks) {
      receiveFile.receivedChunks = [];
    }
  
    if (currentChunk != -1)
    {
        receiveFile.receivedChunks[currentChunk - 1] = fileData;
    }

    // console.log(currentChunk + " " + fileData);
  
    // Check if all chunks are received
    if (currentChunk == -1) {
      // Concatenate all chunks into a single ArrayBuffer
      let totalSize = 0;
      let completeString = "";
        receiveFile.receivedChunks.forEach((chunk) => {
            completeString += chunk;
            totalSize += chunk.length;
        });

        completeString += fileData;
        totalSize += fileData.length;

        // You can continue with base64 conversion here
        // const base64String = arrayBufferToBase64(completeString); // Assuming conversion function

        // Do something with the complete string
        // console.log("Complete string:\n", completeString);
  
      // Display the file link in chat
      displayFile(username, fileName, completeString);
  
    //   console.log(`Received file: ${fileName} (${totalSize} bytes)`);
    }
  }
  
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
  
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
  
    return window.btoa(binary);
  }
  
