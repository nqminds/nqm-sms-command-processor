(function() {
  "use strict";

  var log = require("debug")("nqm-sms-command-processor");
  var errLog = require("debug")("nqm-sms-command-processor:error");
  var SMSMonitor = require("nqm-k4203-z-interface");
  var shell = require("shelljs");
  var util = require("util");

  var monitor = new SMSMonitor();

  // Subscribe to SMS message events.
  monitor.on("msg", function(msg) { 
    log("message received: %j", msg);
    if (msg.body.indexOf("#") === 0) {
      // Strip leading command prefix "#"
      var command = msg.body.substr(1).trim();
      // Check this is a shell command.
      if (command.indexOf("!") === 0) {
        handleShellCommand(msg);
      } else {
        // Strip off params.
        command = command.split(" ")[0];
        switch (command) {
          case "dongle-reboot":
            dongleReboot(msg);
            break;
          case "dongle-get":
            dongleGet(msg);
            break;
          case "dongle-connect":
            dongleConnect(msg);
            break;
          case "update":
            pullLatest(msg);
            break;
          case "status":
            getInterliNQStatus(msg);
            break;
          case "pending":
            getPendingFiles(msg);
            break;
          default:
            log("unknown non-shell command => ignoring %s", command);
            monitor.sendResponse(msg.from, "unknown command: " + command, msg.id);
            break;
        }    
      }      
    } else {
      log("sms not recognised as command (no # prefix - %s)",msg.body);
    }
  });

  monitor.start(10000);

  var dongleReboot = function(msg) {
    // Careful - this command appears to sometimes break the dongle interface.
    // The dongle appears to prefer the device is rebooted with the dongle in place,
    // rather than the dongle rebooted (or hot-plugged) while the device is powered on.
    monitor.sendResponse(msg.from, "rebooting dongle", msg.id);
    monitor.rebootDevice();    
  };
  
  var dongleGet = function(msg) {
    var params = msg.body.split(" ");
    if (params.length > 1) {
      monitor.getParam(params[1], function(err, param) {
        if (err) {
          monitor.sendResponse(msg.from, "failed to get param: " + err.message, msg.id);
        } else {
          log("dongleGet: [%j]",param);
          monitor.sendResponse(msg.from, JSON.stringify(param), msg.id); 
        }                  
      });               
    } else {
      monitor.sendResponse(msg.from, "invalid param request: " + command, msg.id);
    }                
  };
  
  var dongleConnect = function(msg) {
    monitor.connect(function(err, result) {
      if (err) {
        monitor.sendResponse(msg.from, "failed to connect: " + err.message, msg.id);
      } else {
        monitor.sendResponse(msg.from, "dongleConnect: " + result, msg.id);
      }
    });
  };
  
  var getPendingFiles = function(msg) {
    log("get count of files pending transmission");
    executeShellCommand("ls /interliNQ/ucontrol-client/monitor/transmit/*.log | wc -l", msg, "pending transmit");
  };
  
  var pullLatest = function(msg) {
    // Pull the latest sms command processor (i.e. this process)
    // n.b. will require a reboot to be effective.
    log("pulling latest code from git");
    shell.cd(__dirname);
    executeShellCommand("git fetch -v origin emon-003:refs/remotes/origin/emon-003", msg, function() {
      log("executing npm install");
      shell.exec("npm install");
      log("rebooting");
      shell.exec("reboot");
    });
  };
  
  var getInterliNQStatus = function(msg) {
    log("checking interliNQ status");
    var execResult = shell.exec("ps aux | grep ucontrol-client/monitor/monitor.js | grep -v grep | wc -l");
    var monitorStatus = (execResult.stdout.trim() === "0" ? "not running": "ok");
    var localDate = shell.exec("date").stdout;
    var pendingTransmit = shell.exec("ls /interliNQ/ucontrol-client/monitor/transmit/*.log | wc -l").stdout;
    monitor.getParam("ppp_status", function(err, connStatus) {
      if (err) {
        connStatus = err.message;
      } 
      
      var status = util.format("monitor: %s\r\ndate: %s\r\npending: %s\r\nppp_status: %j", monitorStatus, localDate, pendingTransmit, connStatus);
      
      // Send SMS response.
      monitor.sendResponse(msg.from, status, msg.id);
    });
  };

  var handleShellCommand = function(msg) {
    var shellCommand = msg.body.substr(2);
    executeShellCommand(shellCommand, msg);
  };  
  
  var joinText = function(a,b,join) {
    var joined = "";
    if (a) {
      joined += a;
    }
    if (b) {
      if (joined.length > 0) {
        joined += join;
      }
      joined += b;
    }
    return joined;
  };

  var executeShellCommand = function(shellCommand, msg, prefixResponse, cb) {
    if (typeof prefixResponse === "function") {
      cb = prefixResponse;
      prefixResponse = "";
    }
    log("executing shell command '%s'", shellCommand);
    shell.exec(shellCommand, {silent:true}, function(code, output, err) {
      log("shell exec result code %d [%j], err: [%j]", code, output, err);
      // Send SMS response.
      var responseText = joinText(output, err, " - ");
      monitor.sendResponse(msg.from, joinText(prefixResponse,responseText,": "), msg.id);
      
      if (cb) {
        cb(code, output, err);
      }
    });    
  };  
}());
