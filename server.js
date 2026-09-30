const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const dataFile = process.env.EASYBOOK_DATA_FILE || path.join(root, "data", "easybook.json");
const port = Number(process.env.PORT || 3000);
const towns = [
    "Bengaluru", "Mysuru", "Chennai", "Hyderabad", "Mumbai", "Delhi", "Kolara",
    "Kundapura", "Dharwada", "Hubli", "Ballari", "Shivmoga", "Chikka ballapura",
    "Honnavara", "Belagavi", "Maluru", "Mangaluru", "Davangere", "Haliyala"
];
const townCoordinates = {
    "Bengaluru": [12.9716, 77.5946], "Mysuru": [12.2958, 76.6394],
    "Chennai": [13.0827, 80.2707], "Hyderabad": [17.385, 78.4867],
    "Mumbai": [19.076, 72.8777], "Delhi": [28.6139, 77.209],
    "Kolara": [13.1367, 78.1292], "Kundapura": [13.6241, 74.6902],
    "Dharwada": [15.4589, 75.0078], "Hubli": [15.3647, 75.124],
    "Ballari": [15.1394, 76.9214], "Shivmoga": [13.9299, 75.5681],
    "Chikka ballapura": [13.4355, 77.7315], "Honnavara": [14.2798, 74.444],
    "Belagavi": [15.8497, 74.4977], "Maluru": [13.0034, 77.9378],
    "Mangaluru": [12.9141, 74.856], "Davangere": [14.4644, 75.9218],
    "Haliyala": [15.3286, 74.765]
};
const busOptions = [
    { name: "KSRTC Volvo AC", operator: "KSRTC", busType: "A/C Semi-Sleeper (2+2)", departure: "08:00 PM", fare: 1199, seats: 36 },
    { name: "Express Deluxe", operator: "City Express", busType: "Non A/C Sleeper (2+1)", departure: "09:00 PM", fare: 899, seats: 36 },
    { name: "Morning Star", operator: "Morning Star Travels", busType: "A/C Sleeper (2+1)", departure: "10:00 PM", fare: 1099, seats: 36 },
    { name: "Royal Travels", operator: "Royal Travels", busType: "Bharat Benz A/C Sleeper (2+1)", departure: "11:00 PM", fare: 1499, seats: 36 }
];
const festivalPeriods = [
    { name: "Sankranti / Pongal", start: "2026-01-13", end: "2026-01-16", surchargePercent: 35 },
    { name: "Maha Shivaratri", start: "2026-02-14", end: "2026-02-16", surchargePercent: 35 },
    { name: "Holi", start: "2026-03-02", end: "2026-03-04", surchargePercent: 35 },
    { name: "Ugadi / Eid al-Fitr", start: "2026-03-19", end: "2026-03-22", surchargePercent: 35 },
    { name: "Ram Navami", start: "2026-03-26", end: "2026-03-27", surchargePercent: 35 },
    { name: "Bakrid", start: "2026-05-26", end: "2026-05-28", surchargePercent: 35 },
    { name: "Onam / Raksha Bandhan", start: "2026-08-25", end: "2026-08-28", surchargePercent: 35 },
    { name: "Janmashtami", start: "2026-09-04", end: "2026-09-05", surchargePercent: 35 },
    { name: "Ganesh Chaturthi", start: "2026-09-14", end: "2026-09-15", surchargePercent: 35 },
    { name: "Gandhi Jayanti", start: "2026-10-02", end: "2026-10-02", surchargePercent: 35 },
    { name: "Dasara", start: "2026-10-10", end: "2026-10-21", surchargePercent: 35 },
    { name: "Diwali", start: "2026-11-08", end: "2026-11-11", surchargePercent: 35 },
    { name: "Christmas", start: "2026-12-24", end: "2026-12-27", surchargePercent: 35 }
];
const buses = [];
for (const source of towns) {
    for (const destination of towns) {
        if (source === destination) continue;
        busOptions.forEach((bus, index) => buses.push({
            ...bus,
            id: `${slug(source)}-${slug(destination)}-${index + 1}`,
            source,
            destination
        }));
    }
}

function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function routeDistanceKm(source, destination) {
    const [sourceLatitude, sourceLongitude] = townCoordinates[source];
    const [destinationLatitude, destinationLongitude] = townCoordinates[destination];
    const toRadians = degrees => degrees * Math.PI / 180;
    const latitudeDelta = toRadians(destinationLatitude - sourceLatitude);
    const longitudeDelta = toRadians(destinationLongitude - sourceLongitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(toRadians(sourceLatitude)) * Math.cos(toRadians(destinationLatitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    const straightLineKm = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return Math.round(straightLineKm * 1.25);
}

function minutesFromTime(time) {
    const [, hour, minute, meridiem] = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    return (Number(hour) % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(minute);
}

function timeFromMinutes(totalMinutes) {
    const minutes = totalMinutes % 1440;
    const hour = Math.floor(minutes / 60);
    return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function routeDurationMinutes(distanceKm) {
    return Math.max(360, Math.ceil((distanceKm / 55 + 1) * 4) / 4 * 60);
}

function loadStore() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    if (!fs.existsSync(dataFile)) {
        fs.writeFileSync(dataFile, JSON.stringify({ users: [], sessions: [], trips: {}, bookings: [], contactMessages: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

let store = loadStore();
store.contactMessages ||= [];

function saveStore() {
    const temporaryFile = `${dataFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2));
    fs.renameSync(temporaryFile, dataFile);
}

function json(response, status, value) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => {
            body += chunk;
            if (body.length > 1_000_000) reject(new Error("Request body is too large."));
        });
        request.on("end", () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(new Error("Request body must be valid JSON.")); }
        });
        request.on("error", reject);
    });
}

function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const validCalendarDate = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return validCalendarDate && date >= today;
}

function cancellationDetails(booking) {
    const [year, month, day] = booking.journeyDate.split("-").map(Number);
    const departureMatch = String(booking.bus.departure || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!departureMatch) return null;
    let hours = Number(departureMatch[1]) % 12;
    if (departureMatch[3].toUpperCase() === "PM") hours += 12;
    const departure = new Date(year, month - 1, day, hours, Number(departureMatch[2]));
    const hoursUntilDeparture = (departure.getTime() - Date.now()) / 3600000;
    if (hoursUntilDeparture <= 0) return { percentage: 100, cancellationFee: booking.fare, refundAmount: 0 };
    const percentage = hoursUntilDeparture > 24 ? 10 : hoursUntilDeparture > 12 ? 25 : hoursUntilDeparture > 4 ? 50 : 75;
    const cancellationFee = Math.round(booking.fare * percentage / 100);
    return {
        percentage,
        cancellationFee,
        refundAmount: Math.max(0, booking.total - cancellationFee - booking.convenienceFee)
    };
}

function createToken(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    store.sessions.push({ tokenHash: crypto.createHash("sha256").update(token).digest("hex"), userId, expiresAt: Date.now() + 7 * 86400000 });
    saveStore();
    return token;
}

function authenticatedUser(request) {
    const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const session = store.sessions.find(item => item.tokenHash === hash && item.expiresAt > Date.now());
    return session ? store.users.find(user => user.id === session.userId) || null : null;
}

function seatsForTrip(bus, date) {
    const key = `${bus.id}|${date}`;
    store.trips[key] ||= { seats: makeSeats(bus.seats) };
    return store.trips[key].seats;
}

function makeSeats(count) {
    const seats = [];
    for (const deck of ["L", "U"]) {
        for (let index = 1; index <= 6; index++) {
            seats.push({ number: `${deck}S${index}`, gender: null, bookingId: null });
            seats.push({ number: `${deck}D${index}A`, gender: null, bookingId: null });
            seats.push({ number: `${deck}D${index}B`, gender: null, bookingId: null });
        }
    }
    return seats.slice(0, count);
}

function festivalForDate(date) {
    return festivalPeriods.find(period => date >= period.start && date <= period.end) || null;
}

function fareForSeat(bus, seatNumber, journeyDate) {
    const [, rowNumber, berthSide] = seatNumber.match(/^[LU][SD](\d+)([AB])?$/) || [];
    if (!rowNumber) return bus.fare;
    const rowPremium = (Number(rowNumber) - 1) * 5;
    const berthPremium = berthSide === "A" ? 5 : berthSide === "B" ? 10 : 0;
    const deckFare = seatNumber.startsWith("L") ? Math.ceil(bus.fare * 1.1 / 10) * 10 : bus.fare;
    const seatFare = deckFare + rowPremium + berthPremium;
    const festival = festivalForDate(journeyDate);
    return festival ? Math.ceil(seatFare * (1 + festival.surchargePercent / 100) / 10) * 10 : seatFare;
}

function hasIncompleteDoubleSeat(seats) {
    const selectedSeats = new Set(seats);
    return seats.some(seat => {
        if (!/D\d+[AB]$/.test(seat)) return false;
        const adjacentSeat = seat.endsWith("A") ? `${seat.slice(0, -1)}B` : `${seat.slice(0, -1)}A`;
        return !selectedSeats.has(adjacentSeat);
    });
}

function cleanupExpiredHolds() {
    const now = Date.now();
    for (const booking of store.bookings) {
        if (booking.status !== "pending" || booking.holdExpiresAt > now) continue;
        const trip = store.trips[`${booking.bus.id}|${booking.journeyDate}`];
        trip?.seats.forEach(seat => {
            if (seat.bookingId === booking.id) {
                seat.bookingId = null;
                seat.gender = null;
            }
        });
        booking.status = "expired";
    }
}

function publicBooking(booking) {
    const { id, status, bus, journeyDate, boardingPoint, dropPoint, seats, gender, passenger, passengers, fare, convenienceFee, total, bookingDate, paymentMethod, cancellationFee, refundAmount, cancelledAt } = booking;
    return { id, status, bus, journeyDate, boardingPoint, dropPoint, seats, gender, passenger, passengers: passengers || (passenger ? [passenger] : []), fare, convenienceFee, total, bookingDate, paymentMethod, cancellationFee, refundAmount, cancelledAt };
}

async function handleApi(request, response, url) {
    const { pathname, searchParams } = url;
    const method = request.method;

    if (method === "POST" && pathname === "/api/auth/signup") {
        const body = await readBody(request);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            return json(response, 400, { error: "Enter a valid email and a password with uppercase, lowercase, number, and special character." });
        }
        if (store.users.some(user => user.email === email)) return json(response, 409, { error: "An account with this email already exists." });
        const salt = crypto.randomBytes(16).toString("hex");
        const user = { id: crypto.randomUUID(), email, country: String(body.country || "").slice(0, 80), salt, passwordHash: crypto.scryptSync(password, salt, 64).toString("hex") };
        store.users.push(user);
        const token = createToken(user.id);
        saveStore();
        return json(response, 201, { token, user: { email: user.email, country: user.country } });
    }

    if (method === "POST" && pathname === "/api/auth/login") {
        const body = await readBody(request);
        const email = String(body.email || "").trim().toLowerCase();
        const user = store.users.find(item => item.email === email);
        const actual = user ? crypto.scryptSync(String(body.password || ""), user.salt, 64) : Buffer.alloc(64);
        const expected = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(64);
        if (!user || !crypto.timingSafeEqual(actual, expected)) return json(response, 401, { error: "Invalid email or password." });
        const token = createToken(user.id);
        return json(response, 200, { token, user: { email: user.email, country: user.country } });
    }

    const user = authenticatedUser(request);
    if (method === "GET" && pathname === "/api/health") return json(response, 200, { status: "ok" });

    if (method === "POST" && pathname === "/api/contact") {
        const body = await readBody(request);
        const message = {
            name: String(body.name || "").trim(),
            email: String(body.email || "").trim(),
            subject: String(body.subject || "").trim(),
            message: String(body.message || "").trim()
        };
        if (!message.name || message.name.length > 120 || !/^\S+@\S+\.\S+$/.test(message.email) || message.email.length > 254 || !message.subject || message.subject.length > 180 || !message.message || message.message.length > 5000) {
            return json(response, 400, { error: "Enter a valid name, email, subject, and message (up to 5,000 characters)." });
        }
        store.contactMessages.push({ id: crypto.randomUUID(), ...message, receivedAt: new Date().toISOString() });
        saveStore();
        return json(response, 201, { ok: true });
    }

    if (method === "GET" && pathname === "/api/auth/me") {
        if (!user) return json(response, 401, { error: "Please log in to continue." });
        return json(response, 200, { user: { email: user.email, country: user.country } });
    }

    if (method === "POST" && pathname === "/api/auth/primary-email") {
        if (!user) return json(response, 401, { error: "Please log in to change your email." });
        const body = await readBody(request);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
            return json(response, 400, { error: "Enter a valid email address." });
        }
        if (email === user.email.toLowerCase()) {
            return json(response, 400, { error: "This is already your account email." });
        }
        if (store.users.some(account => account.id !== user.id && account.email.toLowerCase() === email)) {
            return json(response, 409, { error: "An account already uses this email as its sign-in address." });
        }
        const actual = crypto.scryptSync(password, user.salt, 64);
        const expected = Buffer.from(user.passwordHash, "hex");
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
            return json(response, 401, { error: "Current password is incorrect." });
        }
        user.email = email;
        saveStore();
        return json(response, 200, { user: { email: user.email, country: user.country } });
    }

    if (method === "POST" && pathname === "/api/auth/logout") {
        const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const hash = crypto.createHash("sha256").update(token).digest("hex");
        store.sessions = store.sessions.filter(session => session.tokenHash !== hash);
        saveStore();
        return json(response, 200, { ok: true });
    }

    if (method === "GET" && pathname === "/api/route-distance") {
        const source = searchParams.get("source");
        const destination = searchParams.get("destination");
        if (!towns.includes(source) || !towns.includes(destination) || source === destination) {
            return json(response, 400, { error: "Choose different source and destination cities." });
        }
        return json(response, 200, { distanceKm: routeDistanceKm(source, destination) });
    }

    if (method === "GET" && pathname === "/api/festivals") {
        const year = searchParams.get("year");
        if (year) {
            if (!/^\d{4}$/.test(year)) return json(response, 400, { error: "Choose a valid calendar year." });
            const festivals = festivalPeriods.filter(period => period.start.startsWith(year));
            return json(response, 200, { festivals });
        }
        const date = searchParams.get("date");
        if (!validDate(date)) return json(response, 400, { error: "Choose a valid journey date today or later." });
        return json(response, 200, { festival: festivalForDate(date) });
    }

    if (method === "GET" && pathname === "/api/buses") {
        const source = searchParams.get("source");
        const destination = searchParams.get("destination");
        const date = searchParams.get("date");
        if (!towns.includes(source) || !towns.includes(destination) || source === destination || !validDate(date)) {
            return json(response, 400, { error: "Choose a valid route and a journey date today or later." });
        }
        cleanupExpiredHolds();
        const festival = festivalForDate(date);
        const results = buses.filter(bus => bus.source === source && bus.destination === destination).map(bus => {
            const seats = seatsForTrip(bus, date);
            const distanceKm = routeDistanceKm(source, destination);
            const durationMinutes = routeDurationMinutes(distanceKm);
            const arrivalTotalMinutes = minutesFromTime(bus.departure) + durationMinutes;
            return {
                ...bus,
            fare: fareForSeat(bus, "US1", date),
                arrival: timeFromMinutes(arrivalTotalMinutes),
                arrivalDayOffset: Math.floor(arrivalTotalMinutes / 1440),
                distanceKm,
                durationMinutes,
                seatsAvailable: seats.filter(seat => !seat.bookingId).length
            };
        });
        saveStore();
        return json(response, 200, { buses: results, festival });
    }

    if (method === "GET" && pathname === "/api/seats") {
        const bus = buses.find(item => item.id === searchParams.get("busId"));
        const date = searchParams.get("date");
        if (!bus || !validDate(date)) return json(response, 400, { error: "Bus or journey date is invalid." });
        cleanupExpiredHolds();
        const seats = seatsForTrip(bus, date).map(seat => ({
            number: seat.number,
            gender: seat.gender,
            booked: Boolean(seat.bookingId),
            fare: fareForSeat(bus, seat.number, date)
        }));
        saveStore();
        return json(response, 200, { bus: { ...bus, fare: fareForSeat(bus, "US1", date) }, festival: festivalForDate(date), seats });
    }

    if (method === "POST" && pathname === "/api/bookings") {
        if (!user) return json(response, 401, { error: "Please log in before booking." });
        const body = await readBody(request);
        const bus = buses.find(item => item.id === body.busId);
        const date = body.journeyDate;
        const seats = Array.isArray(body.seats) ? body.seats : [];
        const gender = body.gender;
        const boardingPoint = String(body.boardingPoint || "").trim();
        const dropPoint = String(body.dropPoint || "").trim();
        const passengers = Array.isArray(body.passengers) ? body.passengers : body.passenger ? [body.passenger] : [];
        const passengerDetails = passengers.map(passenger => ({
            name: String(passenger?.name || "").trim(),
            age: Number(passenger?.age),
            phone: String(passenger?.phone || "").trim()
        }));
        const validPassengers = passengerDetails.length === seats.length && passengerDetails.every(passenger => passenger.name && passenger.name.length <= 100 && Number.isInteger(passenger.age) && passenger.age >= 1 && passenger.age <= 100 && /^\d{10}$/.test(passenger.phone));
        if (!bus || !validDate(date) || !["male", "female"].includes(gender) || !boardingPoint || boardingPoint.length > 120 || !dropPoint || dropPoint.length > 120 || seats.length < 1 || seats.length > 6 || new Set(seats).size !== seats.length || !validPassengers) {
            return json(response, 400, { error: "Check the passenger details, route, date, and selected seats." });
        }
        if (hasIncompleteDoubleSeat(seats)) return json(response, 400, { error: "A double seat must be booked as a pair. Select both seats in the double-seat row." });
        cleanupExpiredHolds();
        const inventory = seatsForTrip(bus, date);
        const selected = inventory.filter(seat => seats.includes(seat.number));
        if (selected.length !== seats.length || selected.some(seat => seat.bookingId)) return json(response, 409, { error: "One or more selected seats are no longer available. Refresh the seat map and try again." });
        if (gender === "male" && selected.some(seat => {
            const adjacentNumber = seat.number.endsWith("A") ? `${seat.number.slice(0, -1)}B` : seat.number.endsWith("B") ? `${seat.number.slice(0, -1)}A` : null;
            return adjacentNumber && inventory.some(other => other.number === adjacentNumber && other.bookingId && other.gender === "female");
        })) return json(response, 409, { error: "A selected seat is next to a seat booked by a female passenger." });

        const fare = selected.reduce((total, seat) => total + fareForSeat(bus, seat.number, date), 0);
        const booking = {
            id: `EB-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
            userId: user.id,
            status: "pending",
            bus,
            journeyDate: date,
            boardingPoint,
            dropPoint,
            seats,
            gender,
            passenger: passengerDetails[0],
            passengers: passengerDetails,
            fare,
            convenienceFee: 20,
            total: fare + 20,
            bookingDate: new Date().toISOString(),
            holdExpiresAt: Date.now() + 10 * 60 * 1000,
            paymentMethod: null
        };
        selected.forEach(seat => { seat.bookingId = booking.id; seat.gender = gender; });
        store.bookings.push(booking);
        saveStore();
        return json(response, 201, { booking: publicBooking(booking) });
    }

    if (method === "GET" && pathname === "/api/bookings") {
        if (!user) return json(response, 401, { error: "Please log in to view your bookings." });
        cleanupExpiredHolds();
        const bookings = store.bookings
            .filter(booking => booking.userId === user.id)
            .sort((first, second) => new Date(second.bookingDate) - new Date(first.bookingDate))
            .map(publicBooking);
        saveStore();
        return json(response, 200, { bookings });
    }

    const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
    if (method === "GET" && bookingMatch) {
        if (!user) return json(response, 401, { error: "Please log in to view this booking." });
        const booking = store.bookings.find(item => item.id === bookingMatch[1] && item.userId === user.id);
        if (!booking) return json(response, 404, { error: "Booking not found." });
        cleanupExpiredHolds();
        saveStore();
        return json(response, 200, { booking: publicBooking(booking) });
    }

    const paymentMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/pay$/);
    if (method === "POST" && paymentMatch) {
        if (!user) return json(response, 401, { error: "Please log in to complete payment." });
        const booking = store.bookings.find(item => item.id === paymentMatch[1] && item.userId === user.id);
        if (!booking) return json(response, 404, { error: "Booking not found." });
        cleanupExpiredHolds();
        if (booking.status !== "pending") return json(response, 409, { error: "This booking is no longer awaiting payment." });
        const body = await readBody(request);
        if (!["upi", "debit", "credit", "netbanking", "wallet"].includes(body.method)) return json(response, 400, { error: "Choose a valid demo payment method." });
        const trip = store.trips[`${booking.bus.id}|${booking.journeyDate}`];
        const bookedSeats = trip?.seats.filter(seat => booking.seats.includes(seat.number)) || [];
        if (bookedSeats.length !== booking.seats.length || bookedSeats.some(seat => seat.bookingId && seat.bookingId !== booking.id)) {
            return json(response, 409, { error: "One or more seats are no longer available. Please contact support." });
        }
        bookedSeats.forEach(seat => {
            seat.bookingId = booking.id;
            seat.gender = booking.gender;
        });
        booking.status = "confirmed";
        booking.paymentMethod = body.method;
        booking.paidAt = new Date().toISOString();
        saveStore();
        return json(response, 200, { booking: publicBooking(booking) });
    }

    const cancelMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
    if (method === "DELETE" && cancelMatch) {
        if (!user) return json(response, 401, { error: "Please log in to cancel a booking." });
        const bookingIndex = store.bookings.findIndex(item => item.id === cancelMatch[1] && item.userId === user.id);
        if (bookingIndex === -1) return json(response, 404, { error: "Booking not found." });
        const booking = store.bookings[bookingIndex];
        if (!["pending", "confirmed"].includes(booking.status)) return json(response, 409, { error: "This booking cannot be cancelled." });
        const cancellation = booking.status === "confirmed" ? cancellationDetails(booking) : { percentage: 0, cancellationFee: 0, refundAmount: 0 };
        if (!cancellation || cancellation.percentage === 100) return json(response, 409, { error: "This booking can no longer be cancelled because the bus has departed." });
        const trip = store.trips[`${booking.bus.id}|${booking.journeyDate}`];
        if (trip) {
            trip.seats.forEach(seat => {
                if (booking.seats.includes(seat.number)) {
                    seat.bookingId = null;
                    seat.gender = null;
                }
            });
        }
        booking.status = "cancelled";
        booking.cancellationFee = cancellation.cancellationFee;
        booking.refundAmount = cancellation.refundAmount;
        booking.cancelledAt = new Date().toISOString();
        saveStore();
        return json(response, 200, { ok: true, message: cancellation.cancellationFee ? `Booking cancelled. Cancellation charge: ₹${cancellation.cancellationFee}. Refund: ₹${cancellation.refundAmount}.` : "Booking cancelled successfully.", booking: publicBooking(booking) });
    }

    return json(response, 404, { error: "API route not found." });
}

const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    try {
        if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
        const requestedPath = url.pathname === "/" ? "/home.html" : decodeURIComponent(url.pathname);
        const filePath = path.resolve(root, `.${requestedPath}`);
        if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            response.writeHead(404);
            return response.end("Not found");
        }
        response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(response);
    } catch (error) {
        json(response, error.message === "Request body must be valid JSON." ? 400 : 500, { error: error.message || "Internal server error." });
    }
});

server.listen(port, () => console.log(`MakeAway running at http://localhost:${port}`));