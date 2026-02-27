(function () {
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const timerDisplay = document.getElementById('timer');
  const statusEl = document.getElementById('status');
  const recordingIndicator = document.getElementById('recordingIndicator');
  const systemAudioToggle = document.getElementById('systemAudioToggle');
  const micToggle = document.getElementById('micToggle');
  const micPreview = document.getElementById('micPreview');
  const micSelect = document.getElementById('micSelect');
  const levelMeterFill = document.getElementById('levelMeterFill');

  let mediaRecorder = null;
  let recordedChunks = [];
  let systemStream = null;
  let micStream = null;
  let audioContext = null;
  let mixedDestination = null;
  let timerInterval = null;
  let seconds = 0;

  // Mic preview state
  let previewStream = null;
  let previewContext = null;
  let previewAnalyser = null;
  let previewAnimFrame = null;

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
    systemAudioToggle.disabled = recording;
    micToggle.disabled = recording;
    micSelect.disabled = recording;
  }

  // --- Mic device enumeration ---

  async function populateMicDevices() {
    try {
      // Need a temporary stream to get labeled devices
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');

      const previousValue = micSelect.value;
      micSelect.innerHTML = '';

      if (audioInputs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No microphones found';
        micSelect.appendChild(opt);
        return;
      }

      audioInputs.forEach((device, i) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.textContent = device.label || ('Microphone ' + (i + 1));
        micSelect.appendChild(opt);
      });

      // Restore previous selection if still available
      if (previousValue && Array.from(micSelect.options).some(o => o.value === previousValue)) {
        micSelect.value = previousValue;
      }
    } catch (err) {
      console.error('Failed to enumerate mic devices:', err);
      micSelect.innerHTML = '<option value="">Mic access denied</option>';
    }
  }

  // --- Mic level preview ---

  async function startMicPreview() {
    stopMicPreview();

    const deviceId = micSelect.value;
    if (!deviceId) return;

    try {
      previewStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      previewContext = new AudioContext();
      previewAnalyser = previewContext.createAnalyser();
      previewAnalyser.fftSize = 256;
      previewAnalyser.smoothingTimeConstant = 0.5;

      const source = previewContext.createMediaStreamSource(previewStream);
      source.connect(previewAnalyser);
      // Don't connect to destination (no playback)

      const dataArray = new Uint8Array(previewAnalyser.frequencyBinCount);

      function updateMeter() {
        previewAnalyser.getByteFrequencyData(dataArray);
        // RMS-ish: average of frequency magnitudes, scaled to percentage
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const pct = Math.min(100, (avg / 255) * 100);
        levelMeterFill.style.width = pct + '%';
        previewAnimFrame = requestAnimationFrame(updateMeter);
      }

      updateMeter();
    } catch (err) {
      console.error('Mic preview failed:', err);
      levelMeterFill.style.width = '0%';
    }
  }

  function stopMicPreview() {
    if (previewAnimFrame) {
      cancelAnimationFrame(previewAnimFrame);
      previewAnimFrame = null;
    }
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }
    if (previewContext) {
      previewContext.close().catch(() => {});
      previewContext = null;
      previewAnalyser = null;
    }
    levelMeterFill.style.width = '0%';
  }

  // --- Toggle handling ---

  micToggle.addEventListener('change', async () => {
    if (micToggle.checked) {
      micPreview.classList.add('active');
      await populateMicDevices();
      startMicPreview();
    } else {
      micPreview.classList.remove('active');
      stopMicPreview();
    }
  });

  micSelect.addEventListener('change', () => {
    if (micToggle.checked) {
      startMicPreview();
    }
  });

  // Re-populate if devices change (plug/unplug)
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    if (micToggle.checked) {
      await populateMicDevices();
      startMicPreview();
    }
  });

  // --- Audio capture ---

  async function getSystemAudioStream() {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: {
        width: { max: 1 },
        height: { max: 1 },
        frameRate: { max: 1 }
      }
    });

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach(t => t.stop());
      throw new Error('No system audio track captured.');
    }

    displayStream.getVideoTracks().forEach(t => t.stop());
    return new MediaStream(audioTracks);
  }

  async function getMicStream() {
    const deviceId = micSelect.value;
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    if (deviceId) {
      constraints.audio.deviceId = { exact: deviceId };
    }
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  function mixStreams(streams) {
    audioContext = new AudioContext();
    mixedDestination = audioContext.createMediaStreamDestination();

    for (const stream of streams) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(mixedDestination);
    }

    return mixedDestination.stream;
  }

  async function startRecording() {
    const wantSystem = systemAudioToggle.checked;
    const wantMic = micToggle.checked;

    if (!wantSystem && !wantMic) {
      setStatus('Enable at least one audio source.', 'error');
      return;
    }

    // Stop mic preview before recording (releases the device)
    stopMicPreview();

    recordBtn.disabled = true;

    try {
      setStatus('Requesting audio capture...');
      const streams = [];

      if (wantSystem) {
        systemStream = await getSystemAudioStream();
        streams.push(systemStream);
      }

      if (wantMic) {
        micStream = await getMicStream();
        streams.push(micStream);
      }

      let finalStream;
      if (streams.length === 2) {
        finalStream = mixStreams(streams);
      } else {
        finalStream = streams[0];
      }

      recordedChunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorder = new MediaRecorder(finalStream, { mimeType });

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
        stopTimer();
        cleanup();
      };

      mediaRecorder.start(1000);
      setRecordingState(true);
      startTimer();

      const sources = [];
      if (wantSystem) sources.push('system audio');
      if (wantMic) sources.push('microphone');
      setStatus('Recording ' + sources.join(' + ') + '...');

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

      const mp3Buffer = await window.audioRecorder.convertToMp3(arrayBuffer);

      if (!mp3Buffer) {
        setStatus('Conversion failed.', 'error');
        return;
      }

      setStatus('Saving...');

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
    if (systemStream) {
      systemStream.getTracks().forEach(t => t.stop());
      systemStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
      mixedDestination = null;
    }
    setRecordingState(false);

    // Restart mic preview if toggle is still on
    if (micToggle.checked) {
      startMicPreview();
    }
  }

  window.addEventListener('beforeunload', stopMicPreview);

  recordBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);

  // Window controls
  document.getElementById('minimizeBtn').addEventListener('click', () => window.audioRecorder.minimize());
  document.getElementById('closeBtn').addEventListener('click', () => window.audioRecorder.close());
})();
