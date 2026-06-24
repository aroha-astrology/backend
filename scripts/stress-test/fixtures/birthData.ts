export interface BirthFixture {
  name: string;
  dob: string;
  tob: string;
  pob: string;
  latitude: number;
  longitude: number;
  timezone: string;
  gender: 'male' | 'female' | 'other';
  tobSource: string;
}

export const BIRTH_FIXTURES: BirthFixture[] = [
  { name: 'Aarav',    dob: '1985-03-12', tob: '04:32', pob: 'Mumbai, Maharashtra',  latitude: 19.0760, longitude: 72.8777, timezone: 'Asia/Kolkata', gender: 'male',   tobSource: 'certificate' },
  { name: 'Diya',     dob: '1992-07-21', tob: '11:18', pob: 'New Delhi',             latitude: 28.6139, longitude: 77.2090, timezone: 'Asia/Kolkata', gender: 'female', tobSource: 'family' },
  { name: 'Vihaan',   dob: '1988-11-08', tob: '22:05', pob: 'Bengaluru, Karnataka',  latitude: 12.9716, longitude: 77.5946, timezone: 'Asia/Kolkata', gender: 'male',   tobSource: 'hospital' },
  { name: 'Ananya',   dob: '1995-01-30', tob: '06:47', pob: 'Chennai, Tamil Nadu',   latitude: 13.0827, longitude: 80.2707, timezone: 'Asia/Kolkata', gender: 'female', tobSource: 'certificate' },
  { name: 'Kabir',    dob: '1990-09-15', tob: '14:22', pob: 'Kolkata, West Bengal',  latitude: 22.5726, longitude: 88.3639, timezone: 'Asia/Kolkata', gender: 'male',   tobSource: 'family' },
  { name: 'Saanvi',   dob: '1998-06-04', tob: '08:55', pob: 'Hyderabad, Telangana',  latitude: 17.3850, longitude: 78.4867, timezone: 'Asia/Kolkata', gender: 'female', tobSource: 'certificate' },
  { name: 'Arjun',    dob: '1983-12-19', tob: '19:40', pob: 'Pune, Maharashtra',     latitude: 18.5204, longitude: 73.8567, timezone: 'Asia/Kolkata', gender: 'male',   tobSource: 'approximate' },
  { name: 'Myra',     dob: '1996-04-27', tob: '02:15', pob: 'Ahmedabad, Gujarat',    latitude: 23.0225, longitude: 72.5714, timezone: 'Asia/Kolkata', gender: 'female', tobSource: 'hospital' },
  { name: 'Reyansh',  dob: '1987-10-03', tob: '16:08', pob: 'Jaipur, Rajasthan',     latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata', gender: 'male',   tobSource: 'family' },
  { name: 'Aaradhya', dob: '1993-02-14', tob: '05:33', pob: 'Lucknow, Uttar Pradesh',latitude: 26.8467, longitude: 80.9462, timezone: 'Asia/Kolkata', gender: 'female', tobSource: 'certificate' },
];
