let nextPageToken = '';
let adTimer;

document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const query = document.getElementById('query').value;
    searchVideos(query);
});

document.getElementById('load-more').addEventListener('click', function () {
    const query = document.getElementById('query').value;
    searchVideos(query, nextPageToken);
});

function showMessage(message) {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
    }
}

function hideMessage() {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
}

function loadAd() {
    fetch('/ad')
        .then(response => response.text())
        .then(adHtml => {
            const adContainer = document.createElement('div');
            adContainer.innerHTML = adHtml;
            document.body.appendChild(adContainer);
        })
        .catch(error => {
            console.error('広告のロードに失敗しました:', error);
        });
}

function showAdPopup() {
    const adPopup = document.getElementById('ad-popup');
    if (adPopup) {
        adPopup.style.display = 'block';

        const adContainer = document.getElementById('ad-container');
        if (adContainer) {
            adContainer.innerHTML = '';
        }

        loadAd();

        adTimer = setTimeout(() => {
            const skipAdButton = document.getElementById('skip-ad');
            if (skipAdButton) {
                skipAdButton.disabled = false;
            }
        }, 30000); // 30秒後にスキップボタンを有効化
    }
}

function hideAdPopup() {
    const adPopup = document.getElementById('ad-popup');
    if (adPopup) {
        adPopup.style.display = 'none';
        const skipAdButton = document.getElementById('skip-ad');
        if (skipAdButton) {
            skipAdButton.disabled = true;
        }
        clearTimeout(adTimer);
    }
}



document.querySelector('.ad-popup .close').addEventListener('click', function () {
    hideAdPopup();
});

function searchVideos(query, pageToken = '') {
    hideMessage();
    const searchUrl = `/search?q=${query}&pageToken=${pageToken}`;

    fetch(searchUrl)
        .then(response => {
            if (response.status === 429) {
                return response.text().then(text => {
                    showMessage(text);
                    showAdPopup();
                    throw new Error(text);
                });
            }
            return response.json();
        })
        .then(data => {
            const resultsList = document.getElementById('results');
            if (!resultsList) return;

            if (!pageToken) {
                resultsList.innerHTML = '';
            }
            data.items.forEach((video, index) => {
                const li = document.createElement('li');
                li.className = 'video-item';

                const infoContainer = document.createElement('div');
                infoContainer.className = 'info-container';

                const titleContainer = document.createElement('div');
                titleContainer.className = 'title-container';
                const title = document.createElement('p');
                title.textContent = video.snippet.title;
                titleContainer.appendChild(title);

                const thumbnailContainer = document.createElement('div');
                thumbnailContainer.className = 'thumbnail-container';
                const thumbnail = document.createElement('img');
                thumbnail.src = video.snippet.thumbnails.default.url;
                thumbnail.alt = video.snippet.title;
                thumbnailContainer.appendChild(thumbnail);

                const channelContainer = document.createElement('div');
                channelContainer.className = 'channel-container';
                const channel = document.createElement('p');
                channel.textContent = `チャンネル: ${video.snippet.channelTitle}`;
                channelContainer.appendChild(channel);

                const linkContainer = document.createElement('div');
                linkContainer.className = 'link-container';
                const link = document.createElement('a');
                link.href = `https://www.youtube.com/watch?v=${video.id.videoId}`;
                link.textContent = 'YouTubeで見る';
                link.target = '_blank';
                linkContainer.appendChild(link);

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'button-container';
                const qualitySelect = document.createElement('select');
                const qualities = ['144p', '360p', '720p', '1080p'];
                qualities.forEach(quality => {
                    const option = document.createElement('option');
                    option.value = quality;
                    option.textContent = quality;
                    qualitySelect.appendChild(option);
                });

                const button = document.createElement('button');
                button.textContent = 'ダウンロード';
                button.onclick = function () {
                    const selectedQuality = qualitySelect.value;
                    const videoId = video.id.videoId || video.id;
                    const downloadUrl = `/download?id=${videoId}&quality=${selectedQuality}`;

                    const progressContainer = document.createElement('div');
                    progressContainer.className = 'progress-container';
                    const progressText = document.createElement('p');
                    progressText.textContent = 'ダウンロード中...';
                    progressContainer.appendChild(progressText);
                    const progressBar = document.createElement('progress');
                    progressBar.max = 100;
                    progressContainer.appendChild(progressBar);
                    buttonContainer.appendChild(progressContainer);

                    fetch(downloadUrl)
                        .then(response => {
                            if (response.status === 429) {
                                return response.text().then(text => {
                                    showMessage(text);
                                    showAdPopup();
                                    throw new Error(text);
                                });
                            }

                            const reader = response.body.getReader();
                            const contentLength = response.headers.get('Content-Length');
                            let receivedLength = 0;

                            return new Response(
                                new ReadableStream({
                                    start(controller) {
                                        function push() {
                                            reader.read().then(({ done, value }) => {
                                                if (done) {
                                                    controller.close();
                                                    return;
                                                }
                                                receivedLength += value.length;
                                                const percentComplete = Math.round((receivedLength / contentLength) * 100);
                                                progressBar.value = percentComplete;
                                                progressText.textContent = `ダウンロード中... ${percentComplete}%`;
                                                controller.enqueue(value);
                                                push();
                                            });
                                        }

                                        push();
                                    }
                                })
                            );
                        })
                        .then(response => response.blob())
                        .then(blob => {
                            const video = document.getElementById('video');
                            const videoControls = document.getElementById('video-controls');
                            if (video && videoControls) {
                                video.src = URL.createObjectURL(blob);
                                video.style.display = 'block';
                                videoControls.style.display = 'flex';
                                video.play();
                                progressText.textContent = 'ダウンロード完了';
                            }
                        })
                        .catch(error => {
                            console.error('Error:', error);
                        });
                };
                buttonContainer.appendChild(qualitySelect);
                buttonContainer.appendChild(button);

                infoContainer.appendChild(titleContainer);
                infoContainer.appendChild(thumbnailContainer);
                infoContainer.appendChild(channelContainer);
                infoContainer.appendChild(linkContainer);
                infoContainer.appendChild(buttonContainer);

                li.appendChild(infoContainer);
                resultsList.appendChild(li);

                // 6つごとに広告を挿入
                if ((index + 1) % 6 === 0) {
                    const adLi = document.createElement('li');
                    adLi.className = 'ad-item';
                    adLi.innerHTML = '<div id="ad-container"></div>';
                    resultsList.appendChild(adLi);
                    loadAd();  // 動的に広告をロード
                }
            });

            nextPageToken = data.nextPageToken;
            const loadMoreButton = document.getElementById('load-more');
            if (loadMoreButton) {
                loadMoreButton.style.display = nextPageToken ? 'block' : 'none';
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// 初回ロード時にランダム動画を表示
window.addEventListener('load', function () {
    searchVideos('えーりん曲');
});

// カスタム動画プレーヤーのコントロール
const video = document.getElementById('video');
const playPauseButton = document.getElementById('play-pause');
const seekBar = document.getElementById('seek-bar');
const muteButton = document.getElementById('mute');
const volumeBar = document.getElementById('volume-bar');
const fullscreenButton = document.getElementById('fullscreen');
const videoPlayer = document.getElementById('video-player');
const videoControls = document.getElementById('video-controls');

if (playPauseButton && video) {
    playPauseButton.addEventListener('click', function () {
        if (video.paused) {
            video.play();
            playPauseButton.textContent = '一時停止';
        } else {
            video.pause();
            playPauseButton.textContent = '再生';
        }
    });
}

if (video) {
    video.addEventListener('timeupdate', function () {
        if (seekBar) {
            const value = (100 / video.duration) * video.currentTime;
            seekBar.value = value;
        }
    });

    if (seekBar) {
        seekBar.addEventListener('input', function () {
            const time = video.duration * (seekBar.value / 100);
            video.currentTime = time;
        });
    }

    if (muteButton) {
        muteButton.addEventListener('click', function () {
            video.muted = !video.muted;
            muteButton.textContent = video.muted ? 'ミュート解除' : 'ミュート';
        });
    }

    if (volumeBar) {
        volumeBar.addEventListener('input', function () {
            video.volume = volumeBar.value;
        });
    }

    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', function () {
            if (videoPlayer.requestFullscreen) {
                videoPlayer.requestFullscreen();
            } else if (videoPlayer.mozRequestFullScreen) { // Firefox
                videoPlayer.mozRequestFullScreen();
            } else if (videoPlayer.webkitRequestFullscreen) { // Chrome and Safari
                videoPlayer.webkitRequestFullscreen();
            } else if (videoPlayer.msRequestFullscreen) { // IE/Edge
                videoPlayer.msRequestFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', function () {
            if (document.fullscreenElement) {
                videoControls.style.position = 'fixed';
                videoControls.style.bottom = '10px';
                videoControls.style.left = '10px';
                videoControls.style.right = '10px';
                video.style.width = '100%';
                video.style.height = '100%';
            } else {
                videoControls.style.position = 'absolute';
                videoControls.style.bottom = '10px';
                videoControls.style.left = '10px';
                videoControls.style.right = '10px';
                video.style.width = '100%';
                video.style.height = 'auto';
            }
        });
    }
}
