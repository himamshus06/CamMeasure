// CamMeasure - Camera-Based Measurement Tool
class CamMeasure {
    constructor() {
        this.camera = null;
        this.stream = null;
        this.isCalibrated = false;
        this.scaleFactor = 1;
        this.measurements = [];
        this.isMeasuring = false;
        this.measurementPoints = [];
        this.currentMeasurement = null;
        
        // DOM elements
        this.video = document.getElementById('camera-feed');
        this.canvas = document.getElementById('overlay-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Reference object dimensions (in cm)
        this.referenceObjects = {
            'credit-card': { width: 8.5, height: 5.4, unit: 'cm' },
            'a4-paper': { width: 21.0, height: 29.7, unit: 'cm' },
            'us-dollar': { width: 15.6, height: 6.6, unit: 'cm' },
            'custom': { width: 8.5, height: 5.4, unit: 'cm' }
        };
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.setupCanvas();
        this.updateReferenceObject();
        this.showInstructions();
        this.initializePWA();
    }

    setupEventListeners() {
        // Camera controls
        document.getElementById('start-camera').addEventListener('click', () => this.startCamera());
        document.getElementById('stop-camera').addEventListener('click', () => this.stopCamera());
        
        // Calibration
        document.getElementById('calibrate-btn').addEventListener('click', () => this.startCalibration());
        document.getElementById('reference-name').addEventListener('change', () => this.updateReferenceObject());
        document.getElementById('reference-length').addEventListener('input', () => this.updateReferenceObject());
        document.getElementById('reference-unit').addEventListener('change', () => this.updateReferenceObject());
        
        // Measurement
        document.getElementById('measure-btn').addEventListener('click', () => this.toggleMeasurement());
        document.getElementById('clear-measurements').addEventListener('click', () => this.clearMeasurements());
        
        // Settings
        document.getElementById('display-unit').addEventListener('change', () => this.updateDisplayUnit());
        document.getElementById('line-color').addEventListener('change', () => this.updateLineColor());
        document.getElementById('line-width').addEventListener('change', () => this.updateLineWidth());
        
        // Canvas click events
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // Modal controls
        document.getElementById('help-btn').addEventListener('click', () => this.showInstructions());
        document.getElementById('get-started-btn').addEventListener('click', () => this.hideInstructions());
        document.querySelector('.close').addEventListener('click', () => this.hideInstructions());
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('instructions-modal')) {
                this.hideInstructions();
            }
        });
    }

    setupCanvas() {
        // Make canvas responsive to video size
        const resizeCanvas = () => {
            if (this.video.videoWidth > 0) {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
            }
        };

        this.video.addEventListener('loadedmetadata', resizeCanvas);
        this.video.addEventListener('resize', resizeCanvas);
    }

    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: 'environment' // Use back camera on mobile
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            // Enable camera-dependent controls
            document.getElementById('start-camera').disabled = true;
            document.getElementById('stop-camera').disabled = false;
            document.getElementById('calibrate-btn').disabled = false;
            
            // Update status
            this.updateStatus('Camera started successfully', 'success');
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('Failed to access camera: ' + error.message, 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            
            // Disable camera-dependent controls
            document.getElementById('start-camera').disabled = false;
            document.getElementById('stop-camera').disabled = true;
            document.getElementById('calibrate-btn').disabled = true;
            document.getElementById('measure-btn').disabled = true;
            
            // Clear canvas
            this.clearCanvas();
            this.updateStatus('Camera stopped', 'pending');
        }
    }

    updateReferenceObject() {
        const referenceName = document.getElementById('reference-name').value;
        const referenceLength = parseFloat(document.getElementById('reference-length').value);
        const referenceUnit = document.getElementById('reference-unit').value;
        
        if (referenceName === 'custom') {
            // Use custom values
            this.currentReference = {
                width: referenceLength,
                height: referenceLength,
                unit: referenceUnit
            };
        } else {
            // Use predefined object
            this.currentReference = this.referenceObjects[referenceName];
            
            // Update input fields to match predefined object
            document.getElementById('reference-length').value = this.currentReference.width;
            document.getElementById('reference-unit').value = this.currentReference.unit;
        }
    }

    startCalibration() {
        if (!this.stream) {
            this.updateStatus('Please start camera first', 'error');
            return;
        }

        this.isCalibrating = true;
        this.calibrationPoints = [];
        
        // Update UI
        document.getElementById('calibrate-btn').textContent = 'Click two points on reference object';
        document.getElementById('calibrate-btn').disabled = true;
        
        // Enable canvas clicks for calibration
        this.canvas.style.pointerEvents = 'auto';
        
        // Show instructions
        document.getElementById('measurement-hint').textContent = 
            'Click two points on the reference object to calibrate';
        
        this.updateStatus('Calibration mode: Click two points on reference object', 'pending');
    }

    handleCanvasClick(e) {
        if (this.isCalibrating) {
            this.handleCalibrationClick(e);
        } else if (this.isMeasuring) {
            this.handleMeasurementClick(e);
        }
    }

    handleCalibrationClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        
        this.calibrationPoints.push({ x, y });
        
        // Draw calibration point
        this.drawPoint(x, y, '#ff6b6b', 8);
        
        if (this.calibrationPoints.length === 2) {
            this.completeCalibration();
        } else {
            this.updateStatus(`Calibration point ${this.calibrationPoints.length}/2 selected`, 'pending');
        }
    }

    completeCalibration() {
        const [point1, point2] = this.calibrationPoints;
        const pixelDistance = Math.sqrt(
            Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
        );
        
        // Calculate scale factor
        const realDistance = this.currentReference.width;
        this.scaleFactor = realDistance / pixelDistance;
        
        // Update UI
        this.isCalibrated = true;
        this.isCalibrating = false;
        
        document.getElementById('calibrate-btn').textContent = '🎯 Calibrate';
        document.getElementById('calibrate-btn').disabled = false;
        document.getElementById('measure-btn').disabled = false;
        
        // Update status
        document.getElementById('calibration-indicator').textContent = 'Calibrated';
        document.getElementById('calibration-indicator').className = 'status-badge status-success';
        document.getElementById('scale-factor').textContent = 
            `Scale: 1px = ${(this.scaleFactor * 10).toFixed(3)}mm`;
        
        // Draw calibration line
        this.drawLine(point1.x, point1.y, point2.x, point2.y, '#48bb78', 3);
        this.drawMeasurement(point1.x, point1.y, point2.x, point2.y, realDistance, this.currentReference.unit);
        
        // Disable canvas clicks
        this.canvas.style.pointerEvents = 'none';
        
        // Update instructions
        document.getElementById('measurement-hint').textContent = 
            'Click "Start Measuring" then tap two points on the object';
        
        this.updateStatus('Calibration complete! You can now measure objects.', 'success');
    }

    toggleMeasurement() {
        if (!this.isCalibrated) {
            this.updateStatus('Please calibrate first', 'error');
            return;
        }

        if (this.isMeasuring) {
            this.stopMeasurement();
        } else {
            this.startMeasurement();
        }
    }

    startMeasurement() {
        this.isMeasuring = true;
        this.measurementPoints = [];
        
        // Update UI
        document.getElementById('measure-btn').textContent = '📏 Stop Measuring';
        document.getElementById('measure-btn').className = 'btn btn-secondary';
        
        // Enable canvas clicks for measurement
        this.canvas.style.pointerEvents = 'auto';
        
        // Show instructions
        document.getElementById('measurement-hint').textContent = 
            'Click two points on the object you want to measure';
        
        this.updateStatus('Measurement mode: Click two points on object', 'pending');
    }

    stopMeasurement() {
        this.isMeasuring = false;
        this.measurementPoints = [];
        
        // Update UI
        document.getElementById('measure-btn').textContent = '📏 Start Measuring';
        document.getElementById('measure-btn').className = 'btn btn-primary';
        
        // Disable canvas clicks
        this.canvas.style.pointerEvents = 'none';
        
        // Update instructions
        document.getElementById('measurement-hint').textContent = 
            'Click "Start Measuring" then tap two points on the object';
        
        this.updateStatus('Measurement mode stopped', 'pending');
    }

    handleMeasurementClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        
        this.measurementPoints.push({ x, y });
        
        // Draw measurement point
        this.drawPoint(x, y, '#667eea', 6);
        
        if (this.measurementPoints.length === 2) {
            this.completeMeasurement();
        } else {
            this.updateStatus(`Measurement point ${this.measurementPoints.length}/2 selected`, 'pending');
        }
    }

    completeMeasurement() {
        const [point1, point2] = this.measurementPoints;
        const pixelDistance = Math.sqrt(
            Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
        );
        
        // Calculate real distance
        const realDistance = pixelDistance * this.scaleFactor;
        const displayUnit = document.getElementById('display-unit').value;
        const convertedDistance = this.convertUnit(realDistance, this.currentReference.unit, displayUnit);
        
        // Add to measurements list
        const measurement = {
            id: Date.now(),
            points: [point1, point2],
            pixelDistance: pixelDistance,
            realDistance: realDistance,
            displayDistance: convertedDistance,
            unit: displayUnit,
            timestamp: new Date()
        };
        
        this.measurements.push(measurement);
        
        // Save offline if needed
        if (!navigator.onLine) {
            this.saveMeasurementOffline(measurement);
        }
        
        // Draw measurement line and label
        const lineColor = document.getElementById('line-color').value;
        const lineWidth = parseInt(document.getElementById('line-width').value);
        this.drawLine(point1.x, point1.y, point2.x, point2.y, lineColor, lineWidth);
        this.drawMeasurement(point1.x, point1.y, point2.x, point2.y, convertedDistance, displayUnit);
        
        // Update measurements list
        this.updateMeasurementsList();
        
        // Reset for next measurement
        this.measurementPoints = [];
        this.isMeasuring = false;
        
        // Update UI
        document.getElementById('measure-btn').textContent = '📏 Start Measuring';
        document.getElementById('measure-btn').className = 'btn btn-primary';
        this.canvas.style.pointerEvents = 'none';
        
        // Update instructions
        document.getElementById('measurement-hint').textContent = 
            'Click "Start Measuring" then tap two points on the object';
        
        this.updateStatus(`Measurement complete: ${convertedDistance.toFixed(2)} ${displayUnit}`, 'success');
    }

    drawPoint(x, y, color, radius) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawLine(x1, y1, x2, y2, color, width) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.stroke();
    }

    drawMeasurement(x1, y1, x2, y2, distance, unit) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Draw background rectangle
        const text = `${distance.toFixed(2)} ${unit}`;
        this.ctx.font = '16px Inter, sans-serif';
        const textMetrics = this.ctx.measureText(text);
        const padding = 8;
        const rectWidth = textMetrics.width + padding * 2;
        const rectHeight = 24;
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.fillRect(midX - rectWidth / 2, midY - rectHeight / 2, rectWidth, rectHeight);
        
        // Draw text
        this.ctx.fillStyle = '#2d3748';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, midX, midY);
    }

    convertUnit(value, fromUnit, toUnit) {
        // Convert to mm first
        let mmValue;
        switch (fromUnit) {
            case 'mm': mmValue = value; break;
            case 'cm': mmValue = value * 10; break;
            case 'in': mmValue = value * 25.4; break;
            default: mmValue = value;
        }
        
        // Convert from mm to target unit
        switch (toUnit) {
            case 'mm': return mmValue;
            case 'cm': return mmValue / 10;
            case 'in': return mmValue / 25.4;
            default: return mmValue;
        }
    }

    updateMeasurementsList() {
        const container = document.getElementById('measurements-list');
        
        if (this.measurements.length === 0) {
            container.innerHTML = '<p class="no-measurements">No measurements yet</p>';
            document.getElementById('clear-measurements').disabled = true;
            return;
        }
        
        document.getElementById('clear-measurements').disabled = false;
        
        container.innerHTML = this.measurements.map(measurement => `
            <div class="measurement-item fade-in">
                <div class="measurement-value">${measurement.displayDistance.toFixed(2)} ${measurement.unit}</div>
                <div class="measurement-details">
                    Pixel distance: ${measurement.pixelDistance.toFixed(1)}px | 
                    ${measurement.timestamp.toLocaleTimeString()}
                </div>
            </div>
        `).join('');
    }

    clearMeasurements() {
        this.measurements = [];
        this.clearCanvas();
        this.updateMeasurementsList();
        this.updateStatus('All measurements cleared', 'pending');
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    updateDisplayUnit() {
        const newUnit = document.getElementById('display-unit').value;
        
        // Update existing measurements display
        this.measurements.forEach(measurement => {
            measurement.displayDistance = this.convertUnit(
                measurement.realDistance, 
                this.currentReference.unit, 
                newUnit
            );
            measurement.unit = newUnit;
        });
        
        this.updateMeasurementsList();
        
        // Redraw all measurements with new units
        this.redrawMeasurements();
    }

    updateLineColor() {
        // Redraw all measurements with new color
        this.redrawMeasurements();
    }

    updateLineWidth() {
        // Redraw all measurements with new width
        this.redrawMeasurements();
    }

    redrawMeasurements() {
        this.clearCanvas();
        
        // Redraw calibration line if exists
        if (this.calibrationPoints && this.calibrationPoints.length === 2) {
            const [point1, point2] = this.calibrationPoints;
            this.drawLine(point1.x, point1.y, point2.x, point2.y, '#48bb78', 3);
            this.drawMeasurement(point1.x, point1.y, point2.x, point2.y, 
                this.currentReference.width, this.currentReference.unit);
        }
        
        // Redraw all measurements
        this.measurements.forEach(measurement => {
            const [point1, point2] = measurement.points;
            const lineColor = document.getElementById('line-color').value;
            const lineWidth = parseInt(document.getElementById('line-width').value);
            
            this.drawLine(point1.x, point1.y, point2.x, point2.y, lineColor, lineWidth);
            this.drawMeasurement(point1.x, point1.y, point2.x, point2.y, 
                measurement.displayDistance, measurement.unit);
        });
    }

    updateStatus(message, type) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // You can add a status display element to show these messages
        // For now, we'll just log them to console
    }

    showInstructions() {
        document.getElementById('instructions-modal').style.display = 'block';
    }

    hideInstructions() {
        document.getElementById('instructions-modal').style.display = 'none';
    }

    // PWA Methods
    async initializePWA() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('[PWA] Service Worker registered successfully:', registration);
                
                // Check for updates
                this.checkForUpdates(registration);
                
                // Handle offline/online status
                this.handleOnlineStatus();
                
                // Check if app is installable
                this.checkInstallability();
                
            } catch (error) {
                console.error('[PWA] Service Worker registration failed:', error);
            }
        } else {
            console.log('[PWA] Service Worker not supported');
        }
    }

    checkForUpdates(registration) {
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New version available
                    this.showUpdateNotification();
                }
            });
        });
    }

    showUpdateNotification() {
        // Show update notification
        if ('serviceWorker' in navigator && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification('CamMeasure Update Available', {
                    body: 'A new version is available. Refresh to update.',
                    icon: '/icons/icon-192x192.png'
                });
            }
        }
    }

    handleOnlineStatus() {
        const offlineIndicator = document.getElementById('offline-indicator');
        
        const updateOnlineStatus = () => {
            if (navigator.onLine) {
                offlineIndicator.classList.add('hidden');
                document.body.classList.remove('offline');
            } else {
                offlineIndicator.classList.remove('hidden');
                document.body.classList.add('offline');
            }
        };

        window.addEventListener('online', () => {
            updateOnlineStatus();
            this.syncOfflineMeasurements(); // Sync offline data when coming back online
        });
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus(); // Initial check
    }

    checkInstallability() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            
            // Stash the event so it can be triggered later
            deferredPrompt = e;
            
            // Show the install prompt
            this.showInstallPrompt();
        });

        // Handle install button click
        document.getElementById('pwa-install-btn').addEventListener('click', async () => {
            if (deferredPrompt) {
                // Show the install prompt
                deferredPrompt.prompt();
                
                // Wait for the user to respond to the prompt
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    console.log('[PWA] User accepted the install prompt');
                } else {
                    console.log('[PWA] User dismissed the install prompt');
                }
                
                // Clear the deferredPrompt
                deferredPrompt = null;
                
                // Hide the install prompt
                this.hideInstallPrompt();
            }
        });

        // Handle dismiss button click
        document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
            this.hideInstallPrompt();
        });
    }

    showInstallPrompt() {
        const installPrompt = document.getElementById('pwa-install-prompt');
        installPrompt.classList.remove('hidden');
    }

    hideInstallPrompt() {
        const installPrompt = document.getElementById('pwa-install-prompt');
        installPrompt.classList.add('hidden');
    }

    // Offline data storage
    saveMeasurementOffline(measurement) {
        if ('localStorage' in window) {
            try {
                const offlineMeasurements = JSON.parse(localStorage.getItem('offlineMeasurements') || '[]');
                offlineMeasurements.push({
                    ...measurement,
                    offline: true,
                    timestamp: Date.now()
                });
                localStorage.setItem('offlineMeasurements', JSON.stringify(offlineMeasurements));
                console.log('[PWA] Measurement saved offline');
            } catch (error) {
                console.error('[PWA] Error saving offline measurement:', error);
            }
        }
    }

    syncOfflineMeasurements() {
        if ('localStorage' in window && navigator.onLine) {
            try {
                const offlineMeasurements = JSON.parse(localStorage.getItem('offlineMeasurements') || '[]');
                if (offlineMeasurements.length > 0) {
                    // Add offline measurements to the main list
                    offlineMeasurements.forEach(offlineMeasurement => {
                        if (!this.measurements.find(m => m.id === offlineMeasurement.id)) {
                            this.measurements.push(offlineMeasurement);
                        }
                    });
                    
                    // Clear offline storage
                    localStorage.removeItem('offlineMeasurements');
                    
                    // Update UI
                    this.updateMeasurementsList();
                    this.redrawMeasurements();
                    
                    console.log('[PWA] Offline measurements synced');
                }
            } catch (error) {
                console.error('[PWA] Error syncing offline measurements:', error);
            }
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CamMeasure();
});

// Handle page visibility changes to pause camera when tab is not visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Optionally pause camera when tab is not visible
        // This can help with performance and battery life
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    // Canvas will automatically resize due to CSS
    // But we can add additional resize logic here if needed
});
