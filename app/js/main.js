'use strict';
$(document).foundation();

var gui = require('nw.gui'),
    fs = require('fs'),
    walkr = require('walkr'),
    path = require('path'),
    async = require("async"),
    exec = require('child_process').exec,
    zipper = require('node-zip-dir'),
    version = require(path.join(process.cwd(), 'package.json')).version,
    LOCALAPPDATA = path.join(process.env.LOCALAPPDATA, 'SPM_JSON');

try {
  var stats = fs.lstatSync(LOCALAPPDATA);
} catch(err) {
  fs.mkdirSync(LOCALAPPDATA);
}

//gui.Window.get().showDevTools();

var spinOpts = {
  lines: 13,
  length: 20,
  width: 10,
  radius: 30,
  corners: 1,
  rotate: 0,
  direction: 1,
  color: '#000',
  speed: 1,
  trail: 60,
  shadow: false,
  hwaccel: false,
  className: 'spinner',
  zIndex: 2e9,
  top: '50%',
  left: '50%'
};
var spinner = new Spinner(spinOpts);
var theText = $('#thetext');
var settings = {}, tmp = {}, idx = 0;
var filesToCopy = {};
var files = {}; // files to add to json
var txt = '';
var textarea = document.getElementById('thetext');

Object.prototype.concat = function(o) {
  for (var key in o) {
    if(typeof o[key] === 'object') {
      for (var k in o[key]) {
        this[key][k] = o[key][k];
      }
    } else {
      this[key] = o[key];
    }
  }
  return this;
}

function log(t) {
  txt += t + ' \n';
  theText.val(txt);
  textarea.scrollTop = textarea.scrollHeight;
}

function copy(source, target, cb) {
  var cbCalled = false;

  var rd = fs.createReadStream(source);
  rd.on("error", function(err) {
    _done(err);
  });
  var wr = fs.createWriteStream(target);
  wr.on("error", function(err) {
    _done(err);
  });
  wr.on("close", function(ex) {
    _done();
  });
  rd.pipe(wr);

  function _done(err) {
    if (!cbCalled) {
      cb(err);
      cbCalled = true;
    }
  }
}

fs.readFile(LOCALAPPDATA + '/spm_settings.json', 'utf-8', function (err, contents) {
  if(err || contents === '') {
    settings = {
      receiverFilesPath: '//marketing/internal/Market Share/Spektrum SRD Files for Upload/',
	    transmitterFilesPath: '//marketing/internal/Market Share/Spektrum SPM Files for Upload/',
      savePaths: ['//deviis/ProdInfo/Files/', '//testiis/websites/ProdInfo/Files/', '//cmp02-web01-tst/websites/prodinfo/Files/', '//cb2/ProdInfo/Files/'],
      exts: ['spm','srm','srd'],
      //tfsPath: 'C:\\xampp\\htdocs\\StaticCMSContent\\media\\scripts\\',
      dirs: ['DX7s_Setups', 'DX8_Setups', 'DXe_Setups', 'Gen2_Setups'],
      transmitters: {
        DX7s_Setups: ['SPM7800'],
        DX8_Setups: ['SPM8800', 'SPMR8810'],
        DXe_Setups: ['SPM1000', 'SPMR1000'],
        Gen2_Setups: ['SPM6700', 'SPMR6700', 'SPM7000', 'SPM9900', 'SPMR9900', 'SPM18000', 'SPM18800', 'SPM18100', 'SPM18200']
      },
      filesCopied: {}
    }
	  settings.dirs.forEach(function(dir) {
		  settings.filesCopied[dir] = {};
	  });
    settings.filesCopied['srd'] = {};
	  log('saving settings');
    fs.writeFile(LOCALAPPDATA + '/spm_settings.json', JSON.stringify(settings));
  } else {
    settings = JSON.parse(contents);
  }

  // Try working with TFS
  /*exec('C:\\Program%20Files%20%28x86%29\\Microsoft%20Visual%20Studio%2011.0\\Common7\\IDE\\tf.exe checkout ' + path.join(settings.tfsPath, 'setups.json'),
  function (error, stdout, stderr) {
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
    if (error !== null) {
      console.log('exec error: ' + error);
    }
  });*/

  setup();
});

function setup() {
  $('#receiverFilesPath').val(settings.receiverFilesPath);
  $('#transmitterFilesPath').val(settings.transmitterFilesPath);
  settings.savePaths.forEach(function (path, i) {
    $('.checks').append(
      $('<input type="checkbox" />').attr({id: 'cb_' + i, checked: 'checked'}).val(path))
      .append($('<label />').attr({for: 'cb_' + i}).text(path))
      .append('<br />');
  });

  for (var key in settings.transmitters) {
    if (settings.transmitters.hasOwnProperty(key)) {
      $('.transmitters').append($('<label />').attr({for: 'tm_' + key}).text(key.split('_')[0]))
        .append($('<input type="text" />').attr({id: 'tm_' + key}).val(settings.transmitters[key].join(',')))
        .append('<br />');
    }
  }
}

function walkFiles() {

  spinner.spin(document.querySelector('body'));
  var obj = {};  // our json object for web consumption
  files[settings.dirs[idx]] = [];
  // add the all setups zip
  files[settings.dirs[idx]].push({title: 'All Setups', file: settings.dirs[idx] + '.zip'});
  filesToCopy[settings.dirs[idx]] = {};
  // add our zip to be copied
  filesToCopy[settings.dirs[idx]]['All'] = {
    source: path.join(settings.transmitterFilesPath, settings.dirs[idx] + '.zip'),
    filename: settings.dirs[idx] + '.zip',
    mtime: Date.now()
  };
  settings.transmitterFilesPath = $('#transmitterFilesPath').val();

	if(!settings.filesCopied[settings.dirs[idx]]) {
		settings.filesCopied[settings.dirs[idx]] = {};
	}

  $('[id^="tm_"]').each(function() {
    settings.transmitters[this.id.slice(3)] = $(this).val().split(',');
  });

  walkr(settings.transmitterFilesPath + settings.dirs[idx])
    .on('file', function (file) {
      var nameParts = file.name.split('.');
      if(settings.exts.indexOf(nameParts[nameParts.length - 1].toLowerCase()) > -1) {
        var t = 'File found: ' + file.name;
        /**
         * we use the segments of the file.source to buld our object
         * eg. "//marketing/internal/Market Share/SPM Files for Upload/EFL2865 Slick 3D 480 ARF/EFL_Slick 3D 480 ARF.srd"
         * parts[parts.length - 2] = EFL2865 Slick 3D 480 ARF
         * parts[parts.length - 2].split(' ')[0] = EFL2865
         * file.name = EFL_Slick 3D 480 ARF.srd
         */
        var parts = file.source.split('/'), title = parts[parts.length - 2], prodId = title.split(' ')[0];
        obj[prodId] = {
          title: title,
          file: file.name
        };
        // check to see if we've got this one already
        if(!settings.filesCopied[settings.dirs[idx]][prodId]) {
          t += ' - adding to copy queue';
          filesToCopy[settings.dirs[idx]][prodId] = {
            source: file.source,
            filename: file.name,
            mtime: Date.parse(file.stat.mtime)
          };
        // it exists but what if it's been modified.
        } else if(settings.filesCopied[settings.dirs[idx]][prodId].mtime !== Date.parse(file.stat.mtime)) {
          t += ' - adding to copy queue';
          filesToCopy[settings.dirs[idx]][prodId] = {
            source: file.source,
            filename: file.name,
            mtime: Date.parse(file.stat.mtime)
          };
        } else {
          t += '';
        }
        log(t);
        // Files for json
        files[settings.dirs[idx]].push({title: title, file: file.name});
      }
    })
    .start(function(err) {  // this acts more like a complete than start - but also triggers execution??

      log('zipping: ' + settings.dirs[idx]);

  	  zipper.zip(settings.transmitterFilesPath + settings.dirs[idx], settings.transmitterFilesPath + settings.dirs[idx] + '.zip').then(function() {

        log(settings.dirs[idx] + '.zip created');

  		  idx++;
  		  if(idx < settings.dirs.length) {
  			  walkFiles();
  		  } else {
  			  spinner.spin(false);
          // save all of our filesToCopy to each save path
          log('Copying files to destination(s)');
          var savePaths = [];
          $('input:checked').each(function(){
            savePaths.push($(this).val());
          });
          // the following is quite a mess!
          async.each(savePaths, function(path, callback) {
            async.each(settings.dirs, function(dir, cb) {
              async.forEachOf(filesToCopy[dir], function (v, k, c) {
                if(typeof v === 'object') {
                  copy(v.source, path + 'SPM/' + v.filename, function(err) {
                    if(err) {
                      c('error copying: ' + path + 'SPM/' + v.filename + '\n' + err);
                    } else {
                      log('copied: ' + path + 'SPM/' + v.filename);
                      c();
                    }
                  });
                }
              }, function(err) {
                if(err) {
                  //call parent callback
                  cb('filesToCopy[dir] each error: ' + err)
                }
                //call parent callback to move on to next item
                cb();
              });
            }, function(err) {
              if(err) {
                //call parent callback
                callback('settings.dirs each error: ' + err)
              }
              //call parent callback to move on to next item
              callback();
            });
          }, function(err) {
            if(err) {
              log('savePaths each error: ' + err)
            }
            //log('done savePaths each');  // launch next step
            // save our setting w/ the list of files copied
            settings.filesCopied = settings.filesCopied.concat(filesToCopy);
            fs.writeFile(LOCALAPPDATA + '/spm_settings.json', JSON.stringify(settings), function(err) {
              if(err) {
                log('error saving settings: ' + err);
              }else {
                log('saved spm_settings.json');
                $('a[href="setups"]').show();
              }
            });
            //console.log(files);
            // save our local copy
            var tmp = [];
            settings.dirs.forEach(function(dir) {
              settings.transmitters[dir].forEach(function(transmitter) {
                var o = {};
                o[transmitter] = files[dir];
                tmp.push(o);
              });
            });
            fs.writeFile(LOCALAPPDATA + '/setups.json', JSON.stringify(tmp), function(err) {
              if(err) {
                log('error saving: setups.json \n' + err);
              } else {
                log('saved setups.json');
                // save our setups.json to each save path
                async.each(savePaths, function(path, callback) {
                  copy(LOCALAPPDATA + '/setups.json', path + 'setups.json', function(err) {
                    if(err) {
                      callback('error copying: ' + path + 'setups.json \n' + err);
                    } else {
                      log('copied: ' + path + 'setups.json');
                      callback();
                    }
                  });
                }, function(err) {
                  if(err) {
                    log('error: ' + err);
                  }
                  log('done with transmitter files');
                  walkSrdFiles();
                });
              }
            });
          });
  		  }
  	  }).catch(function(err) {
  		  log('error zipping catch: ' + err);
  	  });

    });
}

function walkSrdFiles() {
  spinner.spin(document.querySelector('body'));
  settings.receiverFilesPath = $('#receiverFilesPath').val();
  var obj = {};  // our json object for web consumption
  var filesToCopy = {};
  filesToCopy.srd = {};
  filesToCopy.srd.All = {
    source: path.join(settings.receiverFilesPath, 'AS3X_receiver_config_files.zip'),
    filename: 'AS3X_receiver_config_files.zip',
    mtime: Date.now()
  };


  walkr(settings.receiverFilesPath)
  .on('file', function (file) {
    if(file.name.split('.')[1].toLowerCase() === 'srd' || file.name.split('.')[1].toLowerCase() === 'srm') {
      var t =  'File found: ' + file.name;
      /**
       * we use the segments of the file.source to buld our object
       * eg. "//marketing/internal/Market Share/Spektrum SRD Files for Upload/EFL2865 Slick 3D 480 ARF/EFL_Slick 3D 480 ARF.srd"
       * parts[parts.length - 2] = EFL2865 Slick 3D 480 ARF
       * parts[parts.length - 2].split(' ')[0] = EFL2865
       * file.name = EFL_Slick 3D 480 ARF.srd
       */
      var parts = file.source.split('/'), title = parts[parts.length - 2], prodId = title.split(' ')[0];
      obj[prodId] = {
        title: title,
        file: file.name
      }
      // check to see if we've got this one already
      if(!settings.filesCopied.srd[prodId]) {
        t += ' - adding to copy queue';
        filesToCopy.srd[prodId] = {
          source: file.source,
          filename: file.name,
          mtime: Date.parse(file.stat.mtime)
        };
        // it exists but what if it's been modified.
      } else if(settings.filesCopied.srd[prodId].mtime !== Date.parse(file.stat.mtime)) {
        t += ' - adding to copy queue';
        filesToCopy.srd[prodId] = {
          source: file.source,
          filename: file.name,
          mtime: Date.parse(file.stat.mtime)
        };
      } else {
        t += '';
      }
      log(t);
    }
  })
  .start(function (err) {  // this acts more like a complete than start - but also triggers execution??
    if (err) {
      log('error walking files: \n' + err);
      return false;
    }
    var savePaths = [];
    $('input:checked').each(function () {
      savePaths.push($(this).val());
    });

    spinner.spin(false);

    // save our local copy
    fs.writeFile(path.join(LOCALAPPDATA, '/srd.json'), JSON.stringify(obj), function (err) {
      if (err) {
        log('error saving: srd.json \n' + err);
      } else {
        // save our srd.json to each save path
        async.each(savePaths, function(path, callback) {
          copy(LOCALAPPDATA + '/srd.json', path + 'srd.json', function(err) {
            if(err) {
              callback('error copying: ' + path + 'srd.json \n' + err);
            } else {
              log('copied: ' + path + 'srd.json');
              callback();
            }
          });
        }, function(err) {
          if(err) {
            log('error: ' + err);
          }
          log('done copying srd.json files');
        });
      }
    });

    // save all of our filesToCopy to each save path
    async.each(savePaths, function(path, callback) {
      async.each(['srd'], function(dir, cb) {
        async.forEachOf(filesToCopy[dir], function (v, k, c) {
          if(typeof v === 'object') {
            copy(v.source, path + 'SPM/' + v.filename, function(err) {
              if(err) {
                c('error copying: ' + path + 'SPM/' + v.filename + '\n' + err);
              } else {
                log('copied: ' + path + 'SPM/' + v.filename);
                c();
              }
            });
          }
        }, function(err) {
          if(err) {
            //call parent callback
            cb('filesToCopy[dir] each error: ' + err)
          }
          //call parent callback to move on to next item
          cb();
        });
      }, function(err) {
        if(err) {
          //call parent callback
          callback('settings.dirs each error: ' + err)
        }
        //call parent callback to move on to next item
        callback();
      });
    }, function(err) {
      if(err) {
        log(err);
        return;
      }
      log('All Done');
    });

    zipper.zip(settings.receiverFilesPath, settings.receiverFilesPath + 'AS3X_receiver_config_files.zip').then(function () {
      savePaths.forEach(function (path) {
        copy(settings.receiverFilesPath + 'AS3X_receiver_config_files.zip', path + 'SPM/' + 'AS3X_receiver_config_files.zip', function (err) {
          if (err) {
            log('error copying: ' + path + 'SPM/' + 'AS3X_receiver_config_files.zip' + '\n' + err);
          } else {
            log('copied: ' + path + 'SPM/' + 'AS3X_receiver_config_files.zip')
          }
        });
      });
    }).catch(function (err) {
      log('line 447 error: ' + err);
    });
    // save our setting w/ the list of files copied
    settings.filesCopied = settings.filesCopied.concat(filesToCopy);
    fs.writeFile(path.join(LOCALAPPDATA, '/spm_settings.json'), JSON.stringify(settings), function (err) {
      if (err) {
        log('error saving settings: ' + err);
      } else {
        log('saved settings.json');
        $('a[href="srd"]').show();
        log('done');
      }
    });
  });
}

$('#setups, #srd').on('change', function (e) {
  var self = this;
  fs.readFile(LOCALAPPDATA + '/' + self.id + '.json', 'utf-8', function (err, contents) {
    if(err || contents === '') {
      log('error reading ' + self.id + '.json: ' + err);
    } else {
      fs.writeFile(self.value, contents, function(err) {
        if(err) {
          console.log(err);
        }
      });
    }
  });
});
$('.x-closer').on('click', function(e) {
  e.preventDefault();
  gui.App.quit();
});
$('.settings-closer').on('click', function(e) {
  e.preventDefault();
  $('.settings').hide();
});
$('[href="transmitters"]').on('click', function(e) {
  e.preventDefault();
  $('.settings').show();
});
$('#save-settings').on('click', function(e) {
  e.preventDefault();
  $('[id^="tm_"]').each(function() {
    settings.transmitters[this.id.slice(3)] = $(this).val().replace(/ /g, '').split(',');
  });
  fs.writeFile(LOCALAPPDATA + '/spm_settings.json', JSON.stringify(settings));
  $('.settings').hide();
});
$('#go').on('click', function(e) {
  e.preventDefault();
  walkFiles();
});
$('.savers a').on('click', function(e) {
  e.preventDefault();
  var h  = $(this).attr('href');
  $('#' + h).trigger('click');
});
$('.x-cogs').on('click', function(e) {
  e.preventDefault();
  gui.Window.get().showDevTools();
});
