const ytdl = require('youtube-dl');
const { promisify } = require('util');
const ffmpeg = require('fluent-ffmpeg');
const uuidv4 = require('uuid/v4');
const fs = require('fs');

const url = 'https://www.youtube.com/watch?v=Jj3_R8nwy5Q';

const getSubs = async (url) => {
    const getInfo = promisify(ytdl.getInfo);
    let ytOptions = ['-f worst', '--get-url'];
    const info = await getInfo(url, ytOptions);
    
    const getSub = promisify(ytdl.getSubs);
    // await getSub(url, {
    // auto: true,
    // format: 'srt',
    // lang: 'en'
    // });

    const filename = info._filename.split('.mp4')[0] + '.en.vtt';
    const newFilename = uuidv4() + '.vtt';
    let containsSubs = fs.existsSync(filename);
    if (containsSubs) {
        fs.renameSync(filename, newFilename);
    }
    
    return await new Promise((resolve, reject) => {
        let command = ffmpeg(info.url)
        .on('start', function() {
            console.log('starting');
        })
        .on('error', function(err) {
            console.log('error: ' + err.message);
            reject(err);
        })
        .on('progress', console.log)
        .on('stderr', console.log)
        .on('end', function() { resolve() })
        .format('webm')
        .seekInput('00:14:48')
        .duration(30)
        .withVideoCodec('libvpx')
        .withVideoBitrate(1024)
        .withAudioCodec('libvorbis')
        .saveToFile('test.webm');
        if (containsSubs) {
            command.withOutputOptions(containsSubs ? "-vf subtitles=" + newFilename : "");
        }

        command;
    });
};

getSubs(url);