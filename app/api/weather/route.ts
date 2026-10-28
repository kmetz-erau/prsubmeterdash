import { NextResponse } from 'next/server';

const DEFAULT_LAT = 34.5773;
const DEFAULT_LON = -112.4263;

export async function GET() {
  const lat = Number(process.env.WEATHER_LAT || DEFAULT_LAT);
  const lon = Number(process.env.WEATHER_LON || DEFAULT_LON);
  const userAgent = process.env.NOAA_USER_AGENT || 'AiM Meter Intelligence dashboard';
  const headers = { Accept: 'application/geo+json', 'User-Agent': userAgent };

  try {
    const pointsResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers, next: { revalidate: 3600 } });
    if (!pointsResponse.ok) throw new Error(`NOAA points request failed: ${pointsResponse.status}`);
    const points = await pointsResponse.json();
    const forecastUrl = points.properties?.forecastHourly;
    if (!forecastUrl) throw new Error('NOAA did not return an hourly forecast URL');

    const forecastResponse = await fetch(forecastUrl, { headers, next: { revalidate: 900 } });
    if (!forecastResponse.ok) throw new Error(`NOAA forecast request failed: ${forecastResponse.status}`);
    const forecast = await forecastResponse.json();
    const periods = (forecast.properties?.periods || []).slice(0, 168).map((period: Record<string, unknown>) => ({
      startTime: period.startTime,
      temperature: period.temperature,
      temperatureUnit: period.temperatureUnit,
      probabilityOfPrecipitation: (period.probabilityOfPrecipitation as { value?: number } | null)?.value ?? 0,
      windSpeed: period.windSpeed,
      shortForecast: period.shortForecast,
      isDaytime: period.isDaytime,
    }));

    return NextResponse.json({
      location: { latitude: lat, longitude: lon, city: points.properties?.relativeLocation?.properties?.city || 'Campus', state: points.properties?.relativeLocation?.properties?.state || '' },
      updatedAt: new Date().toISOString(),
      periods,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load NOAA weather data' }, { status: 502 });
  }
}
