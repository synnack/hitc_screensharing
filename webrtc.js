var WebSocketDispatcher = function (url) {
    var handlers = {};
    var socket;
    var queue = [];

    var init_socket = function () {
        socket = new WebSocket(url);
        socket.onmessage = function (event) {
            var message = JSON.parse(event.data);

            dispatch(message['message_type'], message['data']);
        };

        socket.onopen = function () {
            while (socket.readyState === 1 && queue[0]) {
                socket.send(queue.shift());
            }
        };

        socket.onclose = function () {
            setTimeout(function () { init_socket(); }, 1000);
        };

    };
    init_socket();

    var dispatch = function (message_type, data) {
        if (!handlers[message_type]) {
            return;
        }

        for (var i = 0; i < handlers[message_type].length; i++) {
            handlers[message_type][i](data);
        }
    };

    this.bind = function (message_type, fn) {
        handlers[message_type] = handlers[message_type] || [];
        handlers[message_type].push(fn);
    };

    this.send = function (message_type, data) {
        var message = JSON.stringify({
            'message_type': message_type,
            'data': data
        });
        if (socket.readyState === 1) {
            socket.send(message);
        } else {
            queue.push(message);
        }
    };
};


// Compatibility globals necessary for video and realtime communication
var pc;
var socket;

// WebRTC compatibility glue
window.URL = window.URL || window.webkitURL || window.mozURL;
navigator.getUserMedia  = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

if (typeof RTCPeerConnection !== "undefined") {
    window.RTCPeerConnection = RTCPeerConnection;
} else if (typeof webkitRTCPeerConnection !== "undefined") {
    window.RTCPeerConnection = webkitRTCPeerConnection;
} else if (typeof mozRTCPeerConnection !== "undefined") {
    window.RTCPeerConnection = mozRTCPeerConnection;
} else if (typeof msRTCPeerConnection !== "undefined") {
    window.RTCPeerConnection = msRTCPeerConnection;
} else {
    alert("This browser will not work.");
}

if (typeof RTCSessionDescription !== "undefined") {
    window.RTCSessionDescription = RTCSessionDescription;
} else if (typeof webkitRTCSessionDescription !== "undefined") {
    window.RTCSessionDescription = webkitRTCSessionDescription;
} else if (typeof mozRTCSessionDescription !== "undefined") {
    window.RTCSessionDescription = mozRTCSessionDescription;
} else if (typeof msRTCSessionDescription !== "undefined") {
    window.RTCSessionDescription = msRTCSessionDescription;
} else {
    alert("This browser will not work.");
}

function open_videostream() {
    var error = function (e) {
        console.log("An error occured during the set up of the video stream");
        console.log(e);
    };
    pc = new RTCPeerConnection(null);
    pc.ontrack = function (obj) {
        console.log(obj);
        video0 = $('video')[0];
        video0.src = window.URL.createObjectURL(obj.stream);
        video0.play();
    };
        
    // This function is necessary for chromium as chromium does not add candidate information by itself
    pc.onicecandidate = function (e) {
        // null is the last candidate, send the offer.
        if (e.candidate === null) {
            socket.send('OFFER_SDP', {
                'sdp': window.offer.sdp
            });
            return;
        }

        // Add the candidate right after m=audio or m=video.
        var sdp = window.offer.sdp.split('\r\n');
        for (var i = 0; i < sdp.length; i++) {
            if (sdp[i].indexOf('m=' + e.candidate.sdpMid) === 0) {
                // FIXME: i + 3 is after the c=IN and a=rtcp SDP attributes
                // May need to add more checks and not hardcode 3 based on an arbitrary length
                sdp.splice(i + 3, 0, e.candidate.candidate.trim());
                break;
            }
        }
        window.offer.sdp = sdp.join("\r\n");
    };

    pc.createOffer(function (offer) {
        pc.setLocalDescription(offer, function () {
            window.offer = offer;
        }, error);
    }, error);
}

function init_preside() {
    socket = new WebSocketDispatcher("wss://" + window.location.hostname + "/websocket");
    socket.bind("OFFER_SDP", function (data) {
        offer = new RTCSessionDescription({'type': 'answer', 'sdp': data['sdp']});
        pc.setRemoteDescription(offer, function() {
            socket.send('SDP_OK', null);
            }, function (e) {
                console.log("Failed to set up video stream:");
                console.log(e);
        });
    });

    socket.bind("NOTIFY_ERROR", function(data) {
        alert(data['text']);
    });
    socket.bind("NOTIFY_STATUS", function(data) {
        console.log(data['text']);
    });
    
    open_videostream();
}

window.onload = init_preside;

