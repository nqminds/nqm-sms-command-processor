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
      var command = msg.body.substr(1);
      // Check this is a shell command.
      if (command.indexOf("!") === 0) {
        handleShellCommand(msg);
      } else {
        switch (command.trim()) {
          case "dongle-reboot":
            // Careful - this command appears to sometimes break the dongle interface.
            // The dongle appears to prefer the device is rebooted with the dongle in place,
            // rather than the dongle rebooted (or hot-plugged) while the device is powered on.
            monitor.sendResponse(msg.from, "rebooting dongle", msg.id);
            monitor.rebootDevice();
            break;
          case "update":
            // Pull the latest sms command processor (i.e. this process)
            pullLatest(msg);
            break;
          case "status":
            getInterliNQStatus(msg);
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

  var pullLatest = function(msg) {
    log("pulling latest code from git");
    executeShellCommand("git fetch -v origin master:refs/remotes/origin/master", msg);
  };
  
  var getInterliNQStatus = function(msg) {
    log("checking interliNQ status");
    var execResult = shell.exec("ps aux | grep ucontrol-client/monitor/monitor.js | grep -v grep | wc -l");
    var monitorStatus = (execResult.stdout.trim() === "0" ? "not running": "ok");
    var localDate = shell.exec("date").stdout;
    
    var status = util.format("monitor: %s\r\ndate: %s", monitorStatus, localDate);
    
    // Send SMS response.
    monitor.sendResponse(msg.from, status, msg.id);
  };

  var handleShellCommand = function(msg) {
    var shellCommand = msg.body.substr(2);
    executeShellCommand(shellCommand, msg);
  };  

  var executeShellCommand = function(shellCommand, msg) {
    log("executing shell command '%s'", shellCommand);
    shell.exec(shellCommand, {silent:true}, function(code, output, err) {
      log("shell exec result code %d [%j], err: [%j]", code, output, err);
      // Send SMS response.
      var responseText = [output, err].join(" - ");
      monitor.sendResponse(msg.from, responseText, msg.id);
    });    
  };  
}());
