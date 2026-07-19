import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import pako from "pako";
import { useDeviceProvisioning } from "../../src/hooks/useDeviceProvisioning";
import { IoCheckmarkCircleOutline } from "react-icons/io5";

// Styles (you may replace with your design system)
const containerStyle: React.CSSProperties = {
  maxWidth: "420px",
  margin: "0 auto",
  padding: "2rem",
  background: "rgba(255,255,255,0.1)",
  backdropFilter: "blur(10px)",
  borderRadius: "1rem",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  color: "#fff",
  textAlign: "center",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  border: "none",
  borderRadius: "0.5rem",
  background: "linear-gradient(135deg, #ff7e5f, #feb47b)",
  color: "#fff",
  cursor: "pointer",
  marginTop: "1rem",
};

export const DeviceProvisioner: React.FC = () => {
  const [step, setStep] = useState(1);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const {
    provision,
    confirmProvision,
    provisionResult,
    confirmResult,
    loading,
    error,
    reset,
  } = useDeviceProvisioning();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(0);

  // Step handlers
  const handleDeviceSelect = (type: string) => {
    setSelectedDevice(type);
    setStep(2);
    provision(type);
  };

  // Generate QR when provisionResult arrives
  useEffect(() => {
    if (provisionResult) {
      const payload = {
        deviceId: provisionResult.deviceId,
        provisionToken: provisionResult.provisionToken,
        wifiSsid: "YourWifiSsid",
        wifiPassword: "YourWifiPassword",
        apiUrl: process.env.NEXT_PUBLIC_API_URL,
        mqttUrl: process.env.NEXT_PUBLIC_MQTT_URL,
        caCertFingerprint: "AB:CD:EF:12:34:56:78:90",
      };
      const jsonStr = JSON.stringify(payload);
      // compress and base64 encode
      const compressed = pako.deflate(jsonStr);
      const base64 = Buffer.from(compressed).toString("base64");
      QRCode.toDataURL(base64, { errorCorrectionLevel: "M", margin: 2 })
        .then(setQrDataUrl)
        .catch(console.error);
      setCountdown(provisionResult.expiresIn);
    }
  }, [provisionResult]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [countdown]);

  // Reset when timer expires
  useEffect(() => {
    if (countdown === 0 && step === 3) {
      setStep(2); // go back to regenerate
    }
  }, [countdown, step]);

  const handleConfirm = () => {
    if (provisionResult) {
      confirmProvision(provisionResult.deviceId, provisionResult.provisionToken);
      setStep(4);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2>Select Device Type</h2>
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
              {[
                "Temperature Sensor",
                "GPS Tracker",
                "Soil Probe",
                "Weather Station",
              ].map((type) => (
                <button key={type} style={buttonStyle} onClick={() => handleDeviceSelect(type)}>
                  {type}
                </button>
              ))}
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div initial={{ x: 300 }} animate={{ x: 0 }} transition={{ type: "spring" }}>
            <h2>Generating Configuration…</h2>
            {loading && <p>Contacting server…</p>}
            {error && (
              <p style={{ color: "#ff6b6b" }}>{error}</p>
            )}
          </motion.div>
        );
      case 3:
        return (
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ duration: 0.4 }}>
            <h2>Scan QR Code</h2>
            {qrDataUrl && <img src={qrDataUrl} alt="Provision QR" style={{ width: "200px", margin: "1rem auto" }} />}
            <p>Expires in: {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</p>
            {countdown === 0 && (
              <button style={buttonStyle} onClick={() => setStep(2)}>
                Regenerate
              </button>
            )}
            <button style={buttonStyle} onClick={handleConfirm} disabled={loading}>
              Confirm Provisioned
            </button>
          </motion.div>
        );
      case 4:
        return (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {confirmResult?.success ? (
                <div>
                  <IoCheckmarkCircleOutline size={64} color="#4caf50" />
                  <h2>Device Provisioned Successfully!</h2>
                </div>
              ) : (
                <p style={{ color: "#ff6b6b" }}>{confirmResult?.error || "Provision failed"}</p>
              )}
            </motion.div>
          </AnimatePresence>
        );
      default:
        return null;
    }
  };

  return <section style={containerStyle}>{renderStep()}</section>;
};
