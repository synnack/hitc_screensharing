
var anchor = top.location.href.split('#')[1];
var iceServers = [{urls: "turn:server.baanhofman.nl", username: 'username', credential: 'password'}];
//var iceServers = [];
var WebSocketDispatcher = function (url, role) {
    var handlers = {};
    var socket;
    var queue = [];

    var init_socket = function () {
        socket = new WebSocket(url);
        socket.onmessage = function (event) {
            var message = JSON.parse(event.data);

            dispatch(message.message_type, message.data, message.src);
        };

        socket.onopen = function () {
            socket.send(JSON.stringify({
                'message_type': 'SUBSCRIBE',
                'channel': role
            }));
            while (socket.readyState === 1 && queue[0]) {
                socket.send(JSON.stringify(queue.shift()));
            }
        };

        socket.onclose = function () {
            setTimeout(function () { init_socket(); }, 1000);
        };

    };
    init_socket();

    var dispatch = function (message_type, data, src) {
        if (!handlers[message_type]) {
            return;
        }

        for (var i = 0; i < handlers[message_type].length; i++) {
            handlers[message_type][i](data, src);
        }
    };

    this.bind = function (message_type, fn) {
        handlers[message_type] = handlers[message_type] || [];
        handlers[message_type].push(fn);
    };

    this.send = function (message_type, data, dst) {
        var message = {
            'message_type': message_type,
            'data': data
        };
        if (dst) {
            message['dst'] = dst;
        }
        if (socket.readyState === 1) {
            socket.send(JSON.stringify(message));
        } else {
            queue.push(message);
        }
    };
};


var Video = function(wsocket) {
    var track;
    var server;
    var online = false;
    var we_are_server = (anchor == 'share');
    
    var Video = function() {
        if (we_are_server) {
            // Server/callee
            console.log("We are the stream source, doing getDisplayMedia.");
            var promise;
            // Modern browsers have navigator.mediaDevices, slightly older ones have getDisplayMedia at navigator
            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                promise = navigator.mediaDevices.getDisplayMedia({video: true, audio: false});
            } else {
                promise = navigator.getDisplayMedia({video: true, audio: false});
            }
            promise.then(function (display_stream) {
                console.log("Succesful getDisplayMedia");
                console.log(display_stream);
	            var video = document.getElementsByTagName("video")[0];
                video.srcObject = display_stream;
                track = display_stream.getTracks()[0];
                console.log(track);
                video.play();
            }).catch(function(e){console.log("getDisplayMedia");console.trace();console.log(e);});
            console.log("Past getUserMedia. Binding OFFER_SDP to offerReceived");
            wsocket.bind('OFFER_SDP', offerReceived);
        } else {
            // Client/caller
            console.log("We are a client, set up a peer connection.");
            server = new RTCPeerConnection({iceServers: iceServers});
            console.log("Creating offer.");
            server.createOffer(function (new_offer) {
                console.log("Creating offer successful, setting LocalDescription");
                server.setLocalDescription(new_offer).then(function() {
                    console.log("setLocalDescription succesful.");
                }).catch(function(e) {console.log("setLocalDescription");console.trace();console.log(e);});
                console.log("Past setLocalDescription.");
            }, function(e){console.log("createOffer");console.trace();console.log(e);}, { offerToReceiveAudio: true, offerToReceiveVideo: true});
            console.log("Past createOffer, Binding addStreamToVideoElement to pc.ontrack.");
            server.ontrack = addStreamToVideoElement;
            console.log("Binding addExtraCandidate to pc.onicecandidate");
            server.onicecandidate = addExtraCandidate;
            server.oniceconnectionstatechange = connectionStateChange;
            server.onconnectionstatechange = connectionStateChange;
            wsocket.bind('ANSWER_SDP', answerReceived);
        }
        
    };

    var connectionStateChange = function(e) {
        console.log(e);
    };
    
    var addStreamToVideoElement = function(obj) {
            if (obj.track.kind == "video") {
                obj.track.muted = false;
                console.log(obj);
                var video = document.getElementsByTagName('video')[0];
                video.srcObject = obj.streams[0];
                //video.controls = false;
                video.play();
                /* Click for full screen */
                document.body.addEventListener('click', function() {
                    openFullscreen(document.body);
                });
                document.body.addEventListener('fullscreenchange', function(e) {
                    if (document.body.style.cursor == 'none') {
                        document.body.style.cursor = '';
                    } else {
                        document.body.style.cursor = 'none';
                    }

                });
            }
            online = true;
    };
    
    // This function is necessary for chromium as chromium does not add candidate information by itself
    var addExtraCandidate = function (e) {
        console.log(e);
        // null is the last candidate, send the offer.
        if (e.candidate === null) {
            if (we_are_server) {
                wsocket.send('ANSWER_SDP', {
                    'sdp': e.currentTarget.currentLocalDescription.sdp
                }, e.currentTarget.src);
            } else {
                wsocket.send('OFFER_SDP', {
                    'sdp': e.target.localDescription.sdp
                }, 'sender');
            }
            return;
        }
    };
    
    
    var offerReceived = function(data, src) {
        console.log("Received offer. Creating peerConnection and adding the stream");
        console.log(data);
        console.log(track);
        var pc = new RTCPeerConnection({iceServers: iceServers});
        pc.src = src;
        pc.oniceconnectionstatechange = connectionStateChange;
        pc.onconnectionstatechange = connectionStateChange;
        pc.addTrack(track);
        console.log("Create sessiondescription");
        var remote_offer = new RTCSessionDescription({'type': 'offer', 'sdp': data.sdp});
        console.log("Setting remoteDescription");
        pc.setRemoteDescription(remote_offer);
        console.log("Creating answer");
        pc.createAnswer().then(function (new_offer) {
            console.log("Answer successful, setLocalDescription.")
            pc.setLocalDescription(new_offer).then(function() {
                console.log('setLocaldescription succesful');
            }).catch(function(e) {console.log("setLocalDescription");console.trace();console.log(e)});
            console.log("Past setLocalDescription");
        }).catch(function(e){console.log("createAnswer");console.trace();console.log(e);});
        console.log("Past createAnswer");
        pc.onicecandidate = addExtraCandidate;
    };
    
    var answerReceived = function(data, src) {
        console.log(data.sdp);
        console.log("Received answer from " + src);
        if (!online && !we_are_server) {
            console.log("Received answer and we are not online yet. Set SessionDescription");
            var remote_offer = new RTCSessionDescription({'type': 'answer', 'sdp': data.sdp});
            console.log("Set remote description");
            server.setRemoteDescription(remote_offer);
            console.log("Past remote description");
        }
    };
    
    Video();
};

function openFullscreen(elem) {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) { /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE/Edge */
    elem.msRequestFullscreen();
  }
}


window.addEventListener('DOMContentLoaded', function() {
    
    var wsocket = new WebSocketDispatcher("wss://" + window.location.hostname + "/websocket", anchor == 'share' ? 'sender' : 'receiver');
   
    video = new Video(wsocket);
    

}, false);

