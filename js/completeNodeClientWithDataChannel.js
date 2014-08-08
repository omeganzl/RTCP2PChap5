'use strict';

/*Look after different browser vendors' ways of calling the getUserMedia()
API method:
OPera --> getUserMedia
Chrome --> webkitGetUserMedia
Firefox --> mozGetUserMedia*/

navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

/*Clean-up Function:
collect garbage before unloading browser's window*/

window.onbeforeunload = function(e) {
	hangup();
}

//Data Channel information
var sendChannel, receiveChannel;
var sendButton = document.getElementById("sendButton");
var sendTextArea = document.getElementById("dataChannelSend");
var receiveTextArea = document.getElementById("dataChannelReceive");

//HTML5 <video> elements
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

//Handler for Send button
sendButton.onclick = sendData;

//Flags...
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;

//WebRTC data structures
//Streams
var localStream;
var remoteStream;

//peerConnection
var pc;

//peerConnection ICE protocol configuration (FF or Chrome)
var pc_config = webrtcDetectedBrowser === 'firefox' ?
	{'iceServers':[{'url':'stun:23.21.150.121'}] } : //IP address
	{'iceServers':[{'url':'stun:stun.1.google.com:19302'}]};

var pc_constraints = {
	'optional': [
		{'DtlsSrtpKeyAgreement': true}
	]};

var sdp_constraints = {};

//Let's get started: prompt user for input (room name)
var room = prompt('Enter Room Name: ');

//Connect to signalling server 
var socket = io.connect("http://localhost:8181");

//Send 'create or join' message to signalling server 
if (room !== '') {
	console.log('create or join room ', room);
	socket.emit('create or join', room);
}

//Set getUserMedia constraints 
var constraints = {video: true, audio: true};

//From this point on, execution proceeds based on asynchronous events...
//getUserMedia() Handlers...
function handleUserMedia(stream) {
	localStream = stream;
	attachedMediaStream(localVideo, stream);
	console.log('Adding local stream.');
	sendMessage('got user media');
}

function handleUserMediaError(error) {
	console.log('navigator.getUserMedia error: ', error);
}

//Server-mediated message exchanging...

//1. Server --> Client...

//Handle 'created' message coming back from server:
//this peer is the initiator 

socket.on('created', function (room) {
	console.log('Created room ' + room);
	isInitiator = true;

	//Call getUserMedia()
	navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
	console.log('Getting user media with constraints', constraints);
	checkAndStart();
});

//Handle 'full' message coming back from server:
//this peer arrived too localStream
socket.on('full', function(room) {
	console.log('Room ' + room + ' is full');
});

//Handle join message coming back from server 
//another peer is joining the channel
socket.on('join', function(room) {
	console.log('Another peer made a request to join room ' + room);
	console.log('This peer is the initiator of room ' + room + '!');
	isChannelReady = true;
});

//Handle 'joined' message coming back from server
//this is the second peer joining the channel
socket.on('joined', function(room) {
	console.log('This peer has joined room ' + room);
	isChannelReady = true;

	//Call getUserMedia() 
	navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
	console.log('Getting user media with constraints ', constraints);
});

//Server-sent log message...
socket.on('log', function(array) {
	console.log.apply(console, array);
});

//Receive message from the other peer via the signalling server
socket.on('message', fucntion (message) {
	console.log('Received message: ', message);
	if (message === 'got user media') {
		checkAndStart();
	} else if (message.type === 'offer') {
		if (!isInitiator && isStarted) {
			checkAndStart();
		}
		pc.setRemoteDescription(new RTCSessionDescription(message));
		doAnswer();
	} else if (message.type === 'answer' && isStarted) {
		pc.setRemoteDescription(new RTCSessionDescription(message));
	} else if (message.type === 'candidate' && isStarted) {
		var candidate = new RTCIceCandidate({sdpMLineIndex:message.label, candidate:message.candidate});
		pc.addIceCandidate(candidate);
	} else if (message === 'bye' && isStarted) {
		handleRemoteHangup();
	}
});
