var path = require('path');
var getLength = require("utf8-byte-length")
var net = require('net');
var shell = require('shelljs');
var HashMap = require('hashmap');
const sessions = new HashMap();

var server = net.createServer();
server.on('connection', handleConnection);
server.listen(8554, function () {
    console.log('server listening to %j', server.address());
});

function handleConnection(conn) {
    var remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
    console.log('new client connection from %s', remoteAddress);
    conn.on('data', onConnData);
    conn.once('close', onConnClose);
    conn.on('error', onConnError);
    function onConnData(req) {
        var tcpString = req.toString('utf8');
        console.log('');
        console.log('%s', tcpString);
        console.log('');

        var headers = new HashMap();
        var lines = tcpString.split("\r\n");
        for (var i = 0, len = lines.length; i < len; i++) {
            if (lines[i].includes(": ")) {
                headers.set(lines[i].split(": ")[0], lines[i].split(": ")[1]);
            }
        }

        const RTSP_200 = "RTSP/1.0 200 OK\r\n";
        const RTSP_501 = "RTSP/1.0 501 Not Implemented\r\n";
        const SERVER_NAME = "NodeJS RTSP server"
        var response = "NO RESPONSE SET";
        var messageType = lines[0].split(" ")[0];
        switch (messageType) {
            case "RTSP/1.0":
                response = RTSP_501;
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "Server: " + SERVER_NAME + "\r\n";
                response += rtspDate();
                break;
            case "OPTIONS":
                // OPTIONS rtsp://localhost:8554/live.sdp RTSP/1.0
                // CSeq: 1
                // User-Agent: Lavf57.83.100
                response = RTSP_200;
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "Public: OPTIONS, DESCRIBE, ANNOUNCE, GET_PARAMETER, PAUSE, PLAY, RECORD, SETUP, SET_PARAMETER, TEARDOWN\r\n";
                response += "Server: " + SERVER_NAME + "\r\n";
                response += rtspDate();
                break;
            case "DESCRIBE":
                // DESCRIBE rtsp://localhost:8554/live.sdp RTSP/1.0
                // Accept: application / sdp
                // CSeq: 2
                // User - Agent: Lavf57.83.100
                var sdp = generateSdp();
                var sdpLengthInBytes = getLength(sdp);
                response = RTSP_200
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "Content-Type: application/sdp\r\n"
                response += "Content-Base: rtsp://localhost:8554/live.sdp/\r\n"
                response += "Server: " + SERVER_NAME + "\r\n"
                response += rtspDate();
                response += "Content-Length: " + sdpLengthInBytes + "\r\n"
                response += sdp;
                break;
            case "SETUP":
                // SETUP rtsp://localhost:8554/live.sdp/stream=0 RTSP/1.0
                // Transport: RTP/AVP/UDP;unicast;client_port=23752-23753
                // CSeq: 3
                // User-Agent: Lavf57.83.100
                var clientPorts = headers.get("Transport").split(";")[2].split("=")[1];
                var rtpPort = clientPorts.split("-")[0];
                var rtcpPort = clientPorts.split("-")[1];
                var sessionId = getRandomInt(1, 99999).toString();
                sessions.set(sessionId, rtpPort);
                console.log("Session RTP Port: " + sessions.get(sessionId));
                response = RTSP_200;
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "Transport: RTP/AVP;unicast;client_port=" + clientPorts + ";server_port=52728-52729;ssrc=40ABEB09;mode=\"PLAY\"\r\n"
                response += "Server: " + SERVER_NAME + "\r\n"
                response += "Session: " + sessionId + "\r\n"
                response += rtspDate();
                break;
            case "PLAY":
                // PLAY rtsp://localhost:8554/live.sdp/ RTSP/1.0
                // Range: npt=0.000-
                // CSeq: 4
                // User-Agent: Lavf57.83.100
                // Session: q58XYTLXeGT6NtNz
                response = RTSP_200
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "RTP-Info: url=rtsp://localhost:8554/live.sdp/stream=0;seq=1;rtptime=0\r\n"
                response += "Range: npt=0-\r\n"
                response += "Server: " + SERVER_NAME + "\r\n"
                response += "Session: " + headers.get("Session") + "\r\n"
                response += rtspDate();

                shell.exec(path.resolve(__dirname, 'rtp_serve.sh') + " " + sessions.get(headers.get("Session")) + " " + getRandomInt(0, 25).toString(), { async: true, silent: true });
                break;
            case "TEARDOWN":
                // TEARDOWN rtsp://localhost:8554/live.sdp/ RTSP/1.0
                // CSeq: 5
                // User-Agent: Lavf57.83.100
                // Session: q58XYTLXeGT6NtNz
                response = RTSP_200
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "Server: " + SERVER_NAME + "\r\n"
                response += "Session: " + headers.get("Session") + "\r\n"
                response += "Connection: close\r\n"
                response += rtspDate();
                break;
            default:
                response = RTSP_501;
                response += "CSeq: " + headers.get("CSeq") + "\r\n";
                response += "Server: " + SERVER_NAME + "\r\n";
                response += rtspDate();
                break;
        }

        console.log(response);
        conn.write(response + "\r\n");
    }
    function onConnClose() {
        console.log('connection from %s closed', remoteAddress);
    }
    function onConnError(err) {
        console.log('Connection %s error: %s', remoteAddress, err.message);
    }
}

function generateSdp() {
    var sdp = "\r\n"
    sdp += "v=0\r\n"
    sdp += "o=- 12937757946092301954 1 IN IP4 172.17.0.2\r\n"
    sdp += "s=Session streamed with GStreamer\r\n"
    sdp += "i=rtsp-server\r\n"
    sdp += "t=0 0\r\n"
    sdp += "a=tool:GStreamer\r\n"
    sdp += "a=type:broadcast\r\n"
    sdp += "a=control:*\r\n"
    sdp += "a=range:npt=0-\r\n"
    sdp += "m=video 0 RTP/AVP 96\r\n"
    sdp += "c=IN IP4 0.0.0.0\r\n"
    sdp += "b=AS:2097\r\n"
    sdp += "a=rtpmap:96 H264/90000\r\n"
    sdp += "a=framerate:25\r\n"
    sdp += "a=fmtp:96 packetization-mode=1;profile-level-id=42c01f;sprop-parameter-sets=Z0LAH9oBQBbsBagICAoAAAMAAgAAAwBlHjBlQA==,aM48gA==\r\n"
    sdp += "a=control:stream=0\r\n"
    sdp += "a=ts-refclk:local\r\n"
    sdp += "a=mediaclk:sender"
    return sdp;
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rtspDate() {
    return "Date: " + new Date().toGMTString() + "\r\n";
}

function createResponse(req) {
    var obj = {};
    var headers = new HashMap();
    obj.headers = headers;
    obj.setHeader = function (header, value) {
        this.headers.set(header, value);
    };
    var body = "";
    obj.body = body;
    return obj;
}