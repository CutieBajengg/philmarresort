// -------------------------------
// Philmar Resort Website Server
// (FINAL FIXED VERSION – with Admin, Booking User Link, and Profile Bookings)
// -------------------------------

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const dotenv = require("dotenv");
const MongoStore = require("connect-mongo");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------
// DATABASE CONNECTION
// -------------------------------
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/philmar_resort",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("✅ Connected to MongoDB successfully");
    createDefaultAdmin(); // 👈 Ensure admin account exists
  })
  .catch((err) => console.error("❌ MongoDB connection failed:", err.message));

// -------------------------------
// VIEW ENGINE
// -------------------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// -------------------------------
// STATIC FILES
// -------------------------------
app.use(express.static(path.join(__dirname, "public")));
app.use("/css", express.static(path.join(__dirname, "public/css")));
app.use("/images", express.static(path.join(__dirname, "public/images")));
app.use("/videos", express.static(path.join(__dirname, "public/videos")));

// -------------------------------
// MIDDLEWARE
// -------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || "philmar_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl:
        process.env.MONGODB_URI || "mongodb://localhost:27017/philmar_resort",
      collectionName: "sessions",
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

// ✅ Make session data available in all EJS views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = req.session.admin || null;
  res.locals.loggedIn = !!req.session.user;
  res.locals.isAdmin = !!req.session.admin;
  next();
});

// -------------------------------
// 🧩 GLOBAL DASHBOARD VARIABLES (Combined Fix)
// -------------------------------
app.use((req, res, next) => {
  res.locals.totalBookings = 0;
  res.locals.acceptedBookings = 0;
  res.locals.declinedBookings = 0;
  res.locals.pendingBookings = 0;
  res.locals.totalGuests = 0;
  res.locals.totalRevenue = 0;
  next();
});

// -------------------------------
// MODELS
// -------------------------------
const Booking = require("./models/Booking");
const User = require("./models/User");
const Admin = require("./models/Admin");

// -------------------------------
// DEFAULT ADMIN CREATION
// -------------------------------
async function createDefaultAdmin() {
  try {
    const existingAdmin = await Admin.findOne({
      username: "philmarresortadmin",
    });
    if (!existingAdmin) {
      const newAdmin = new Admin({
        username: "philmarresortadmin",
        password: "resortphilmar2025",
      });
      await newAdmin.save();
      console.log("✅ Default admin account created:");
      console.log(" Username: philmarresortadmin");
      console.log(" Password: resortphilmar2025");
    } else {
      console.log("ℹ️ Default admin already exists.");
    }
  } catch (err) {
    console.error("❌ Error creating default admin:", err);
  }
}

// -------------------------------
// ROUTES
// -------------------------------

// ✅ USER ROUTES
const userRoutes = require("./routes/userRoutes");
app.use("/", userRoutes);

// ✅ ADMIN ROUTES
const adminRoutes = require("./routes/adminRoutes");
app.use("/admin", adminRoutes);

// ✅ HOME PAGE
app.get("/", (req, res) => {
  res.render("index", { title: "Philmar Resort | Home" });
});

// ✅ BOOKING PAGE
app.get("/booking", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("booking", {
    title: "Book Your Stay | Philmar Resort",
    success: null,
    error: null,
  });
});

// ✅ BOOKING SUBMIT (FULL FIX with userId)
app.post("/booking/submit", async (req, res) => {
  try {
    const { checkin, checkout, guests, room } = req.body;
    if (!checkin || !checkout || !guests || !room) {
      return res.render("booking", {
        title: "Book Your Stay | Philmar Resort",
        error: "Please fill out all fields before submitting.",
        success: null,
      });
    }

    if (!req.session.user) return res.redirect("/login");

    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect("/login");

    const newBooking = new Booking({
      userId: user._id,
      name: user.fullname || user.username || "Guest",
      checkin,
      checkout,
      guests,
      room,
      status: "pending",
    });

    await newBooking.save();
    console.log("✅ New booking saved:", newBooking);

    req.session.successMessage =
      "Your booking has been successfully submitted!";
    res.redirect("/profile");
  } catch (err) {
    console.error("❌ Error saving booking:", err);
    res.render("booking", {
      title: "Book Your Stay | Philmar Resort",
      error: "Something went wrong. Please try again later.",
      success: null,
    });
  }
});

// -------------------------------
// STATIC PAGES
// -------------------------------
app.get("/accommodation", (req, res) =>
  res.render("accommodation", { title: "Accommodation | Philmar Resort" })
);
app.get("/gallery", (req, res) =>
  res.render("gallery", { title: "Gallery | Philmar Resort" })
);
app.get("/rules", (req, res) =>
  res.render("rules", { title: "Resort Rules | Philmar Resort" })
);
app.get("/contact", (req, res) =>
  res.render("contact", { title: "Contact Us | Philmar Resort" })
);

// -------------------------------
// PROFILE PAGE (Shows user’s bookings)
// -------------------------------
app.get("/profile", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  try {
    const user = await User.findById(req.session.user._id).lean();
    if (!user) {
      req.session.destroy(() => res.redirect("/login"));
      return;
    }

    const bookings = await Booking.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    const notifications = [];
    if (req.session.successMessage) {
      notifications.push({ message: req.session.successMessage });
      delete req.session.successMessage;
    } else {
      notifications.push({
        message: `Welcome back, ${user.fullname || "Guest"}!`,
      });
    }

    res.render("profile", {
      title: "My Profile | Philmar Resort",
      user,
      bookings,
      notifications,
    });
  } catch (err) {
    console.error("❌ Error loading profile:", err);
    res.status(500).send("Error loading profile");
  }
});

// -------------------------------
// UPDATE PASSWORD
// -------------------------------
app.post("/profile/update-password", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect("/login");

    const isMatch = await user.comparePassword(currentPassword);
    const bookings = await Booking.find({ userId: user._id }).lean();

    if (!isMatch) {
      return res.render("profile", {
        title: "My Profile | Philmar Resort",
        user,
        bookings,
        notifications: [{ message: "❌ Incorrect current password." }],
      });
    }

    user.password = newPassword;
    await user.save();
    console.log(`✅ Password updated for ${user.email}`);

    res.render("profile", {
      title: "My Profile | Philmar Resort",
      user,
      bookings,
      notifications: [{ message: "✅ Password successfully updated!" }],
    });
  } catch (err) {
    console.error("❌ Error updating password:", err);
    res.redirect("/profile");
  }
});

// -------------------------------
// AUTH ROUTES
// -------------------------------
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", {
    title: "Login / Signup | Philmar Resort",
    error: null,
    success: null,
  });
});

app.get("/signup", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("signup", {
    title: "Sign Up | Philmar Resort",
    error: null,
    success: null,
  });
});

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { fullname, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("signup", {
        title: "Sign Up | Philmar Resort",
        error: "Email already registered. Please login instead.",
        success: null,
      });
    }

    const newUser = new User({ fullname, email, password });
    await newUser.save();

    console.log("✅ New user registered:", newUser.email);
    res.render("login", {
      title: "Login / Signup | Philmar Resort",
      success: "Account created successfully! You can now login.",
      error: null,
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.render("signup", {
      title: "Sign Up | Philmar Resort",
      error: "Something went wrong. Please try again later.",
      success: null,
    });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({
      $or: [{ email: username }, { username }],
    });

    if (!user) {
      return res.render("login", {
        title: "Login / Signup | Philmar Resort",
        error: "User not found. Please sign up first.",
        success: null,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render("login", {
        title: "Login / Signup | Philmar Resort",
        error: "Incorrect password.",
        success: null,
      });
    }

    req.session.user = {
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      username: user.username || user.email.split("@")[0],
    };

    console.log("✅ User logged in:", user.email);
    res.redirect("/profile");
  } catch (err) {
    console.error("❌ Login error:", err);
    res.render("login", {
      title: "Login / Signup | Philmar Resort",
      error: "Something went wrong. Please try again.",
      success: null,
    });
  }
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// -------------------------------
// 404 PAGE
// -------------------------------
app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found | Philmar Resort" });
});

// -------------------------------
// START SERVER
// -------------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
