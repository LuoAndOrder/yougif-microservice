const ytdl = require('youtube-dl');
const { promisify } = require('util');
const ffmpeg = require('fluent-ffmpeg');
const uuidv4 = require('uuid/v4');
const fs = require('fs');

const url = 'https://www.youtube.com/watch?v=GcdB5bFwio4';

const getSubs = async (url) => {
    const getInfo = promisify(ytdl.getInfo);
    let ytOptions = ['-f 22/43/18', '--get-url'];
    const info = await getInfo(url, ytOptions);
    
    const filename = info._filename.split('.mp4')[0] + '.en.vtt';
    const newFilename = uuidv4() + '.vtt';
    fs.renameSync(filename, newFilename);

    const getSub = promisify(ytdl.getSubs);
    await getSub(url, {
    auto: true,
    format: 'srt',
    lang: 'en'
    });
    
    return await new Promise((resolve, reject) => {
        ffmpeg(info.url)
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
        .withOutputOptions("-vf subtitles=" + newFilename)
        .saveToFile('test.webm')
    });
};

getSubs(url);