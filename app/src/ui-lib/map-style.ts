export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#121417' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7A827F' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B0D0F' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2A2E33' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#22262B' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#16191C' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2C3136' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A1A1E' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#14171A' }] },
];

export const lightMapStyle = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
