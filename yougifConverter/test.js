const ytdl = require('youtube-dl');
const { promisify } = require('util');
const ffmpeg = require('fluent-ffmpeg');
const uuidv4 = require('uuid/v4');
const fs = require('fs');

const url = 'https://www.youtube.com/watch?v=myh94hpFmJY';

const getSubs = async (url) => {
    const getInfo = promisify(ytdl.getInfo);
    let ytOptions = ['-f 22/43/18', '--get-url'];
    const info = await getInfo(url, ytOptions);
    
    const getSub = promisify(ytdl.getSubs);
    await getSub(url, {
    auto: true,
    format: 'srt',
    lang: 'en'
    });

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
        .on('end', function() { resolve() })
        .format('webm')
        .seekInput('00:00:00')
        .duration(10)
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