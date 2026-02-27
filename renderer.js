(function () {
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const timerDisplay = document.getElementById('timer');
  const statusEl = document.getElementById('status');
  const recordingIndicator = document.getElementById('recordingIndicator');

  let mediaRecorder = null;
  let recordedChunks = [];
  let stream = null;
  let timerInterval = null;
  let seconds = 0;

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function setStatus(text, type = '') {
    statusEl.textContent = text;
    statusEl.className = 'status' + (type ? ` ${type}` : '');
  }

  function startTimer() {
    seconds = 0;
    timerDisplay.textContent = '00:00:00';
    timerInterval = setInterval(() => {
      seconds++;
      timerDisplay.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function setRecordingState(recording) {
    recordBtn.disabled = recording;
    stopBtn.disabled = !recording;
    recordingIndicator.classList.toggle('active', recording);
  }

  async function startRecording() {
    try {
      setStatus('Requesting audio capture...');

      // Request display media - main process handler auto-selects loopback audio
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: {
          width: { max: 1 },
          height: { max: 1 },
          frameRate: { max: 1 }
        }
      });

      // Check if we got audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio track captured. System audio may not be available.');
      }

      // Discard video tracks - we only want audio
      stream.getVideoTracks().forEach(track => track.stop());

      // Create audio-only stream
      const audioStream = new MediaStream(audioTracks);

      recordedChunks = [];

      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorder = new MediaRecorder(audioStream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await processRecording();
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setStatus('Recording error: ' + event.error.message, 'error');
        cleanup();
      };

      // Start recording with 1-second chunks
      mediaRecorder.start(1000);
      setRecordingState(true);
      startTimer();
      setStatus('Recording system audio...');

    } catch (err) {
      console.error('Failed to start recording:', err);
      cleanup();

      if (err.name === 'NotAllowedError') {
        setStatus('Permission denied. Please allow audio capture.', 'error');
      } else {
        setStatus('Failed to start: ' + err.message, 'error');
      }
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    stopTimer();
    setRecordingState(false);
    setStatus('Processing...');
  }

  async function processRecording() {
    try {
      if (recordedChunks.length === 0) {
        setStatus('No audio data recorded.', 'error');
        return;
      }

      setStatus('Converting to MP3...');

      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();

      // Send to main process for ffmpeg conversion
      const mp3Buffer = await window.audioRecorder.convertToMp3(arrayBuffer);

      if (!mp3Buffer) {
        setStatus('Conversion failed.', 'error');
        return;
      }

      setStatus('Saving...');

      // Open save dialog
      const result = await window.audioRecorder.saveFile(mp3Buffer);

      if (result.cancelled) {
        setStatus('Save cancelled. Recording discarded.', '');
      } else if (result.success) {
        setStatus('Saved: ' + result.filePath, 'success');
      } else {
        setStatus('Save failed: ' + (result.error || 'Unknown error'), 'error');
      }

    } catch (err) {
      console.error('Processing error:', err);
      setStatus('Error: ' + err.message, 'error');
    } finally {
      recordedChunks = [];
      cleanup();
    }
  }

  function cleanup() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    setRecordingState(false);
  }

  recordBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
})();
