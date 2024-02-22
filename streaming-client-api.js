'use strict';
import DID_API from './api.json' assert { type: 'json' };

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

// ASK CODE 
const recogonition = new (window.speechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition)();
recogonition.lang = 'en-US';

let askButton = document.getElementById('ask-button');
let question = document.getElementById('question');
let answer = document.getElementById('answer');
let clear = document.getElementById('clear-button');
let submit = document.getElementById('submit-button');
const menu = document.getElementById('menu');
const side_bar = document.getElementById('side-bar');
const close = document.getElementById('close')

menu.addEventListener('click',()=>{
  console.log('clicked');
  menu.style.display = "none"
  close.style.display = "block"
  side_bar.style.width = '200px'
})
close.addEventListener('click',()=>{
  close.style.display = "none"
  menu.style.display = "block"
  side_bar.style.width = '0px'
})

recogonition.onstart = ()=> {
  askButton.textContent = 'Listening...'
  setTimeout(()=>{
  }, [3000])
}
recogonition.onresult = (event)=> {
  console.log(event);
  let old_content = question.textContent
  const transcript = event.results[0][0].transcript;
  question.textContent = old_content + " " + transcript
  console.log('old_content ', old_content);
  console.log('transcript ', transcript);
  console.log('result ', old_content + transcript);
}
recogonition.onend = ()=> {
  askButton.textContent = 'Ask'
}
askButton.onclick = ()=> {
  recogonition.start();
}
clear.onclick = ()=> {
  question.textContent = ""
}

// END OF ASK CODE 

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;

let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;
let reply = "";

const videoElement = document.getElementById('video-element');
videoElement.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');
const streamingStatusLabel = document.getElementById('streaming-status-label');

const presenterInputByService = {
  talks: {
    source_url: 'https://d-id-public-bucket.s3.amazonaws.com/or-roman.jpg',
  },
  clips: {
    presenter_id: 'rian-lZC6MmWfC1',
    driver_id: 'mXra4jY38i'
  }
}

const connectButton = document.getElementById('connect-button');

connectButton.onclick = async () => {
  // await fetch('/log',{method:"GET"}).then(res=>res.json()).then(data=>{console.log(data);})
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }

  stopAllStreams();
  closePC();

  const sessionResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(presenterInputByService[DID_API.service]),
  });
  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;

  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  const sdpResponse = await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
};

// document.addEventListener('DOMContentLoaded',()=>{
//   connectButton.click()
// })

const startButton = document.getElementById('start-button');

submit.onclick = async()=> {
  await fetch('/answer',
  {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      "question":question.textContent,
      "test":"success"
    })
  }).then(result=>result.json()).then(data=>{
    console.log(data.result);
    answer.textContent = data.result
    reply = data.result
    startButton.click()
  })
}

startButton.onclick = async () => {
  console.log(reply);
  console.log(typeof(reply));
  // connectionState not supported in firefox
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    const playResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "script": {
          "type": "text",
          "subtitles": "false",
          "provider": {
            "type": "microsoft",
            "voice_id": "en-US-AndrewNeural"
          },
          "ssml": "false",
          "input": reply
        },
        ...(DID_API.service === 'clips' && {
          background: {
            color: '#FFFFFF'
          }
        }),
        "config": {
          "fluent": "false",
          "pad_audio": "0.0",
          "stitch":true
        },
        "audio_optimization": 3,
        session_id: sessionId,
      }),
    });
  }
};

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};

function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}

function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = 'streaming';
    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    status = 'empty';
    playIdleVideo();
  }
  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = 'streamingState-' + status;
}

function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no video is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks (or clips) endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}

async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  return sessionClientAnswer;
}

function setVideoElement(stream) {
  if (!stream) return;
  videoElement.srcObject = stream;
  videoElement.loop = false;

  // safari hotfix
  if (videoElement.paused) {
    videoElement
      .play()
      .then((_) => {})
      .catch((e) => {});
  }
}

function playIdleVideo() {
  videoElement.srcObject = undefined;
  videoElement.src = DID_API.service == 'clips' ? 'rian_idle.mp4' : 'or_idle.mp4';
  videoElement.loop = true;
}

function stopAllStreams() {
  if (videoElement.srcObject) {
    console.log('stopping video streams');
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}

function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  clearInterval(statsIntervalId);
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

const maxRetryCount = 3;
const maxDelaySec = 4;

async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}
