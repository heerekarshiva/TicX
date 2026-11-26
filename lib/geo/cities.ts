// Reference data for the city picker (NOT listings). India is fully covered at state level with major
// cities; other countries fall back to free-text state/city so nobody is blocked.
export const COUNTRIES = ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Singapore', 'Canada', 'Australia', 'Other'] as const;

export const INDIA_STATES: Record<string, string[]> = {
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore', 'Kurnool', 'Rajahmundry', 'Kakinada', 'Anantapur', 'Kadapa'],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun'],
  'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tezpur'],
  'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia'],
  'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg'],
  'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar', 'Jamnagar'],
  'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Manali'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro Steel City'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Ballari', 'Shivamogga', 'Tumakuru'],
  'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Solapur', 'Kolhapur', 'Navi Mumbai', 'Amravati'],
  'Manipur': ['Imphal'],
  'Meghalaya': ['Shillong'],
  'Mizoram': ['Aizawl'],
  'Nagaland': ['Kohima', 'Dimapur'],
  'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri'],
  'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
  'Sikkim': ['Gangtok'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Secunderabad', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Siddipet'],
  'Tripura': ['Agartala'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Noida', 'Bareilly', 'Aligarh', 'Gorakhpur'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Kharagpur'],
  'Andaman and Nicobar Islands': ['Port Blair'],
  'Chandigarh': ['Chandigarh'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Daman', 'Silvassa'],
  'Delhi': ['New Delhi', 'Delhi'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu'],
  'Ladakh': ['Leh'],
  'Lakshadweep': ['Kavaratti'],
  'Puducherry': ['Puducherry']
};

export const INDIA_STATE_NAMES = Object.keys(INDIA_STATES).sort();

// Cities are written differently in listings/events (users type them). Group spellings so "Bangalore"
// listings still match a user whose city is "Bengaluru".
const ALIAS_GROUPS: string[][] = [
  ['bengaluru', 'bangalore', 'bengalooru'],
  ['mumbai', 'bombay'],
  ['chennai', 'madras'],
  ['kolkata', 'calcutta'],
  ['hyderabad', 'secunderabad'],
  ['gurugram', 'gurgaon'],
  ['mysuru', 'mysore'],
  ['mangaluru', 'mangalore'],
  ['thiruvananthapuram', 'trivandrum'],
  ['kochi', 'cochin'],
  ['visakhapatnam', 'vizag', 'visakapatnam'],
  ['vadodara', 'baroda'],
  ['prayagraj', 'allahabad'],
  ['pune', 'poona'],
  ['puducherry', 'pondicherry'],
  ['tiruchirappalli', 'trichy', 'tiruchirapalli'],
  ['new delhi', 'delhi'],
  ['hubballi', 'hubli']
];

export function normalizeCity(c: string | null | undefined): string {
  return (c ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** All spellings (lowercase) that should count as the same city. Always includes the input itself. */
export function cityVariants(city: string | null | undefined): string[] {
  const n = normalizeCity(city);
  if (!n) return [];
  const group = ALIAS_GROUPS.find(g => g.includes(n));
  return group ? [...group] : [n];
}

export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const va = cityVariants(a);
  const nb = normalizeCity(b);
  return !!nb && va.includes(nb);
}
