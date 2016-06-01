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
        executeShellCommand(msg);
      } else {
        switch (command) {
          case "dongle-reboot":
            monitor.sendResponse(msg.from, "rebooting dongle", msg.id);
            monitor.rebootDevice();
            break;
          case "update":
            pullLatest(msg);
            break;
          case "status":
            getInterliNQStatus(msg);
            break;
          default:
            log("unknown non-shell command => ignoring %s", command);
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
    var execResult = shell.exec("git fetch -v origin master:refs/remotes/origin/master");
    monitor.sendResponse(msg.from, execResult.stdout.trim(), msg.id);  
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

  var executeShellCommand = function(msg) {
    var shellCommand = msg.body.substr(2);
    log("executing shell command '%s'", shellCommand);
    shell.exec(shellCommand, function(code, output) {
      log("shell exec result code %d [%s]", code, output);
      // Send SMS response.
      monitor.sendResponse(msg.from, output, msg.id);
    });    
  };  
}());
