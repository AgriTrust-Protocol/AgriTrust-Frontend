export async function provisionDevice(deviceType: string) {
  const response = await fetch("/api/device/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceType }),
  });
  if (!response.ok) throw new Error("Failed to provision");
  return response.json();
}

export async function confirmDeviceProvision(deviceId: string, token: string) {
  const response = await fetch("/api/device/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, token }),
  });
  if (!response.ok) throw new Error("Failed to confirm");
  return response.json();
}
