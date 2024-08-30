// Import required modules
require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const fs = require('fs');
const flash = require('connect-flash');
const path = require('path');
const multer = require('multer');
const cron = require('node-cron');
const { type } = require('os');

// Initialize Express app
const app = express();

// Middleware for parsing request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// app.use('/uploads', express.static('public/uploads'));


// Set up EJS as the template engine
app.set('view engine', 'ejs');

// Set up session middleware
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGOURL }),
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));


// Connect to MongoDB
mongoose.connect(process.env.MONGOURL);

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  country: String,
  address: String,
  phone: String,
  gender: String,
  password: String,
  status: { type: String, default: "Status" },
  walletBalance: { type: Number, default: 0.00 },
  bitcoinAddress: String,
  ethereumAddress: String,
  usdtAddress: String,
  walletPhrase: String,
  lastAccrualDate: {
    type: Date,
    default: null, // Default to null so you can identify users who haven't accrued profits yet
  },
  // KYC document information
  kycDocument: {
    fileName: String,       // Name of the file saved on the server
    originalName: String,   // Original name of the file uploaded by the user
    uploadDate: { type: Date, default: Date.now }  // Date the document was uploaded
  },
  kycStatus: { type: String, default: 'Unverified' }, // unverified, pending, verified
  Interest: { type: Number, default: 0.00 },
  registrationDate: { type: Date, default: Date.now() },
  totalBalance: { type: Number, default: 0.00 },
  hasTransferredHalf: { type: Boolean, default: false }, // Track if half has been transferred
  totalInvestmentBalance: { type: Number, default: 0.00 }, // New field to store the total investment balance
  withdraw: { type: Number, default: 0.00 },
  referralCode: String, // This will be the code the user can share with friends
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the user who referred them
  referralBonus: { type: Number, default: 0 } // Total bonus received from referrals
});

const User = mongoose.model('User', userSchema);

//Admin Schema
const adminSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  gender: String,
  email: String,
  password: String
});

const Admin = mongoose.model('Admin', adminSchema);

const siteSettingsSchema = new mongoose.Schema({
  contactEmail: { type: String, default: 'sweeptrades@gmail.com' },
  contactPhoneNumber: { type: String, default: '123-456-7890' },
  discordLink: { type: String, default: 'https://discord.gg/FrrdZyWH' },
  telegramLink: { type: String, default: 'https://t.me/SweepTrade' },
  whatsappLink: { type: String, default: 'https://wa.me/13044123924' }
});

const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);


//referral Stuffs
const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

userSchema.pre('save', function (next) {
  if (this.isNew) {
    this.referralCode = generateReferralCode();
  }
  next();
});


// investment Schema and Section
const investmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  packageType: String,
  amount: { type: Number, default: '0.00' },
  // profit: { type: Number, default: 'null' },
  dailyProfit: Number, // Store the calculated daily profit
  status: { type: String, default: 'Pending' },
  startDate: { type: Date, default: Date.now },
  expiryDate: Date, // New field to store the expiration date
  isTransferred: { type: Boolean, default: false }, // New field to check if transferred
  hasTransferredHalf: { type: Boolean, default: false },
  hasBeenTransferred: { type: Boolean, default: false }, // New field to track transfer status
  hasFullyTransferred: { type: Boolean, default: false },
  dateOfInvestment: { type: Date, default: Date.now },
  minAmount: Number,
  maxAmount: Number
});

const Investment = mongoose.model('Investment', investmentSchema);


// Middleware to protect routes
function checkAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  } else {
    res.redirect('/login');
  }
};

function checkAuthenticatedAdmin(req, res, next) {
  if (req.session.userId) {
    return next();
  } else {
    res.redirect('/ontoadminpansec/login');
  }
};

// Flash messages setup
app.use(flash());

// Middleware to make flash messages accessible in views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// // Mongoose Transaction Schema
// const transactionSchema = new mongoose.Schema({
//   amount: Number,
//   coin: String,
//   balance: { type: String, default: '0.00' },
//   status: { type: String, default: 'Pending' },
//   transactionId: { type: String, required: true, unique: true },
//   walletAddress: String,
//   proofOfPayment: String,
//   date: { type: Date, default: Date.now },
// });

// const Transaction = mongoose.model('Transaction', transactionSchema);



// Schema for Transactions

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  imagePath: String,
  transactionId: String,
  investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment' },
  type: { type: String, enum: ['deposit', 'investment', 'withdrawal', 'referral'], },
  amount: Number,
  coin: String,
  status: { type: String, default: 'Pending' },
  proofOfPayment: String,
  walletAddress: String,
  description: String,
  paymentDate: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);


// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
// Create the directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });


// Run every 24 hours

cron.schedule('0 0 * * *', async () => {
  try {
    // Fetch all active investments
    const investments = await Investment.find({ status: 'active' });

    for (let investment of investments) {
      // Add the daily profit to the user's wallet balance
      const user = await User.findById(investment.userId);
      if (user) {
        user.walletBalance += investment.dailyProfit;
        user.totalBalance += investment.dailyProfit;
        await user.save();
      }
    }

    console.log('Daily profit accrued successfully.');
  } catch (err) {
    console.error('Error accruing daily profit:', err);
  }
});

// cron.schedule('0 0 * * *', async () => {
//   try {
//     console.log('Starting daily profit accrual...');

//     // Fetch all active investments
//     const investments = await Investment.find({ status: 'active' });

//     const bulkOperations = investments.map(investment => ({
//       updateOne: {
//         filter: { _id: investment.userId },
//         update: { $inc: { walletBalance: investment.dailyProfit } }
//       }
//     }));

//     if (bulkOperations.length > 0) {
//       await User.bulkWrite(bulkOperations);
//     }

//     console.log('Daily profit accrued successfully.');
//   } catch (err) {
//     console.error('Error accruing daily profit:', err);
//   }
// });

// cron.schedule('0 0 * * *', async () => {
//   try {
//     // Fetch all active investments
//     const investments = await Investment.find({ status: 'active' });

//     for (let investment of investments) {
//       // Add the daily profit to the user's wallet balance
//       const user = await User.findById(investment.userId);
//       user.walletBalance += investment.dailyProfit;
//       await user.save();
//     }

//     console.log('Daily profit accrued successfully.');
//   } catch (err) {
//     console.error('Error accruing daily profit:', err);
//   }
// });


cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();

    const investments = await Investment.find({ status: 'active', expiryDate: { $lte: now } });

    for (let investment of investments) {
      investment.status = 'expired';
      await investment.save();
    }

    // console.log('Expired investments updated successfully.');
  } catch (err) {
    console.error('Error updating expired investments:', err);
  }
});


// Definition of routes
app.get('/', async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    const contactEmail = settings ? settings.contactEmail : 'sweeptrade@gmail.com';
    const contactPhoneNumber = settings ? settings.contactPhoneNumber : '123-456-7890';
    const discordLink = settings ? settings.discordLink : 'https://discord.gg/FrrdZyWH';
    const telegramLink = settings ? settings.telegramLink : 'https://t.me/SweepTrade';
    const whatsappLink = settings ? settings.whatsappLink : 'https://wa.me/13044123924';

    res.render('index', { page: 'home', pageTitle: 'Home', contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink }); // Render 'index.ejs'
  } catch (err) {
    console.error('Error fetching contact info:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/about', async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    const contactEmail = settings ? settings.contactEmail : 'sweeptrade@gmail.com';
    const contactPhoneNumber = settings ? settings.contactPhoneNumber : '123-456-7890';
    const discordLink = settings ? settings.discordLink : 'https://discord.gg/FrrdZyWH';
    const telegramLink = settings ? settings.telegramLink : 'https://t.me/SweepTrade';
    const whatsappLink = settings ? settings.whatsappLink : 'https://wa.me/13044123924';

    res.render("about-us", { page: 'about', pageTitle: 'About', contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink });
  } catch (err) {
    console.error('Error fetching contact info:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/faq', async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    const contactEmail = settings ? settings.contactEmail : 'sweeptrade@gmail.com';
    const contactPhoneNumber = settings ? settings.contactPhoneNumber : '123-456-7890';
    const discordLink = settings ? settings.discordLink : 'https://discord.gg/FrrdZyWH';
    const telegramLink = settings ? settings.telegramLink : 'https://t.me/SweepTrade';
    const whatsappLink = settings ? settings.whatsappLink : 'https://wa.me/13044123924';

    res.render("faq", { page: 'faq', pageTitle: 'FAQ', contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink });
  } catch (err) {
    console.error('Error fetching contact info:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/contact', async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    const contactEmail = settings ? settings.contactEmail : 'sweeptrade@gmail.com';
    const contactPhoneNumber = settings ? settings.contactPhoneNumber : '123-456-7890';
    const discordLink = settings ? settings.discordLink : 'https://discord.gg/FrrdZyWH';
    const telegramLink = settings ? settings.telegramLink : 'https://t.me/SweepTrade';
    const whatsappLink = settings ? settings.whatsappLink : 'https://wa.me/13044123924';

    res.render('contact', { page: 'contact', pageTitle: 'Contact', contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink });
  } catch (err) {
    console.error('Error fetching contact info:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/signup', (req, res) => {
  const referralCode = req.query.ref || ''; // Get the referral code from the query parameters
  // const { ref } = req.query;
  res.render('signup', { referralCode });
});

app.post('/signup', upload.none(), async (req, res) => {
  const { firstName, lastName, email, country, address, phone, gender, password, ref } = req.body;

  if (password.length < 8) {
    return res.json({ message: 'Password must be at least 8 characters long.' });
  }

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.json({ message: 'User already exists with this email or phone number.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if the referral code is valid
    let referrer = null;
    if (ref) {
      referrer = await User.findOne({ referralCode: ref });
      if (!referrer) {
        return res.json({ message: 'Invalid referral code.' });
      }
    }

    const referralCode = generateReferralCode(); // Implement this function to generate a unique code

    const newUser = new User({
      firstName,
      lastName,
      email,
      country,
      address,
      phone,
      gender,
      password: hashedPassword,
      referralCode,
      referredBy: referrer ? referrer._id : null,
    });

    await newUser.save();

    // If a valid referral code was used, give the referrer a bonus
    if (referrer) {
      const referralBonus = 10; // Set the bonus amount here
      referrer.walletBalance += referralBonus;
      referrer.referralBonus += referralBonus;
      referrer.totalBalance += referralBonus; // Add referral bonus to totalBalance
      await referrer.save();

      // Optionally, create a transaction record for the bonus
      const newTransaction = new Transaction({
        userId: referrer._id,
        amount: referralBonus,
        coin: 'USD',
        status: 'success',
        paymentDate: new Date(),
        description: `Referral bonus for referring ${newUser.firstName}`,
      });
      await newTransaction.save();
    }

    res.json({ message: 'Registration Successful!', redirectUrl: '/login' });
  } catch (err) {
    console.error('Error saving user:', err);
    res.json({ message: 'Registration Failed!' });
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', upload.none(), async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ message: 'Invalid password.' });
    }

    // Set user session
    req.session.userId = user._id;
    res.json({ message: 'Login Successful!', redirectUrl: '/user/dashboard' });
  } catch (err) {
    console.error('Error during login:', err);
    res.json({ message: 'Login Failed!' });
  }
});

app.get('/privacy', async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    const contactEmail = settings ? settings.contactEmail : 'sweeptrade@gmail.com';
    const contactPhoneNumber = settings ? settings.contactPhoneNumber : '123-456-7890';
    const discordLink = settings ? settings.discordLink : 'https://discord.gg/FrrdZyWH';
    const telegramLink = settings ? settings.telegramLink : 'https://t.me/SweepTrade';
    const whatsappLink = settings ? settings.whatsappLink : 'https://wa.me/13044123924';

    res.render('privacy', { contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink });
  } catch (err) {
    console.error('Error fetching contact info:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/terms', async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    const contactEmail = settings ? settings.contactEmail : 'sweeptrade@gmail.com';
    const contactPhoneNumber = settings ? settings.contactPhoneNumber : '123-456-7890';
    const discordLink = settings ? settings.discordLink : 'https://discord.gg/FrrdZyWH';
    const telegramLink = settings ? settings.telegramLink : 'https://t.me/SweepTrade';
    const whatsappLink = settings ? settings.whatsappLink : 'https://wa.me/13044123924';

    res.render('terms', { contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink });
  } catch (err) {
    console.error('Error fetching contact info:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/error', (req, res) => {
  res.render('error');
});

// User Dashboard Code begins here
app.get("/user/dashboard", checkAuthenticated, async (req, res) => {
  try {
    // Fetch the user based on the session's userId
    const user = await User.findById(req.session.userId);
    const userId = req.session.userId;

    const kycStatus = await User.find({ kycStatus: 'Pending' && 'Verified' });

    // Fetch all active investments
    const activeInvestments = await Investment.find({ userId, status: 'active' }).sort({ startDate: -1 });

    // Get the most recent investment
    const currentInvestment = activeInvestments[0];

    // Calculate total daily profit
    const totalDailyProfit = activeInvestments.reduce((sum, investment) => sum + investment.dailyProfit, 0);

    if (!user) {
      return res.redirect('/error');
    }

    // Check if the profit has already been accrued for today
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to midnight to compare dates only

    if (!user.lastAccrualDate || user.lastAccrualDate < today) {
      // Add the daily profit to the user's wallet and total balance
      user.walletBalance += totalDailyProfit;
      user.totalBalance += totalDailyProfit;

      // Update the lastAccrualDate to today
      user.lastAccrualDate = today;
      await user.save();

      console.log('Daily profit accrued successfully.');
    }

    // Check if user has a referral code
    if (!user.referralCode) {
      user.referralCode = generateReferralCode(); // Ensure there's a fallback
      await user.save();
    }

    // Fetch pending transactions related to the user
    const deposit = await Transaction.find({ userId: req.session.userId, type: 'deposit', status: 'Pending' }).sort({ paymentDate: -1 });
    const withdraw = await Transaction.find({ userId: req.session.userId, status: 'pending', type: 'withdrawal' }).sort({ paymentDate: -1 });

    // Find the latest successful investment
    const investment = await Investment.findOne({ userId: req.session.userId, status: 'active' }).sort({ createdAt: -1 });

    // Render the dashboard with consistent data structure
    res.render('dashboard', {
      user,
      deposit,
      withdraw,
      investment,
      currentInvestment,
      activeInvestments,
      kycStatus,
      totalDailyProfit,
      referralBonus: user.referralBonus, // Pass the referral bonus to the front-end
      protocol: req.protocol,
      host: req.get('host')
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get("/user/profile", checkAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/error');
    }
    res.render('profile', { user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.post('/user/update-profile', checkAuthenticated, async (req, res) => {
  try {
    const { address, phone } = req.body;
    await User.findByIdAndUpdate(req.session.userId, { address, phone });
    req.flash('success_msg', 'Profile updated successfully!');
    res.redirect('/user/profile');
  } catch (err) {
    console.error('Error updating profile:', err);
    req.flash('error_msg', 'Failed to update profile.');
    res.redirect('/user/profile');
  }
});

app.post('/user/update-wallets', checkAuthenticated, async (req, res) => {
  try {
    const { bitcoinAddress, ethereumAddress, usdtAddress, walletPhrase } = req.body;
    await User.findByIdAndUpdate(req.session.userId, {
      bitcoinAddress,
      ethereumAddress,
      usdtAddress,
      walletPhrase,
    });
    req.flash('success_msg', 'Wallet addresses updated successfully!');
    res.redirect('/user/profile');
  } catch (err) {
    console.error('Error updating wallet addresses:', err);
    req.flash('error_msg', 'Failed to update wallet addresses.');
    res.redirect('/user/profile');
  }
});

app.post('/user/update-password', checkAuthenticated, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      req.flash('error_msg', 'New passwords do not match.');
      return res.redirect('/user/profile');
    }

    const user = await User.findById(req.session.userId);
    const isMatch = bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      req.flash('error_msg', 'Old password is incorrect.');
      return res.redirect('/user/profile');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    req.flash('success_msg', 'Password updated successfully!');
    res.redirect('/user/profile');
  } catch (err) {
    console.error('Error updating password:', err);
    req.flash('error_msg', 'Failed to update password.');
    res.redirect('/user/profile');
  }
});

app.post('/user/kyc-verification', checkAuthenticated, upload.single('document'), async (req, res) => {
  try {
    // const proofOfIdPath = req.file.path;
    const user = await User.findById(req.session.userId);

    // await User.findByIdAndUpdate(req.session.userId, {
    //   proofOfId: proofOfIdPath,
    //   kycStatus: 'Pending',
    // });
    if (user.kycStatus === 'Verified') {
      req.flash('error_msg', 'Your account is already verified.');
      return res.redirect('/user/profile');
    }

    // Update user's KYC information
    user.kycDocument = {
      fileName: req.file.filename,
      originalName: req.file.originalname
    };
    user.kycStatus = 'Pending';
    await user.save();

    req.flash('success_msg', 'KYC submitted successfully. Please wait for verification.');
    res.redirect('/user/profile');
  } catch (err) {
    console.error('Error submitting KYC:', err);
    req.flash('error_msg', 'Failed to submit KYC.');
    res.redirect('/user/profile');
  }
});

app.get('/user/investment', checkAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.redirect('/error');
  }
  const investments = await Transaction.find({ userId, type: 'investment' }).populate('investmentId').sort({ paymentDate: -1 });
  res.render('investment', { user, investments });
});

app.post('/user/investment', checkAuthenticated, async (req, res) => {
  const { amount, packageType } = req.body;
  // const userId = req.user._id;
  const investmentAmount = parseFloat(amount); // Ensure the amount is treated as a number

  const investmentPackages = {
    Basic: { min: 500, max: 5000, profit: 15.0 }, // 1.5% daily
    Pro: { min: 15000, max: 90000, profit: 8.0 }, // 2% daily
    Premium: { min: 30000, max: 2500000, profit: 8.0 }, // 2.5% daily
    Retirement: { min: 60000, max: 100000000, profit: 8.0 }, // 3% daily
    Dynasty: { min: 269000, max: 2684000, profit: 8.0 }, // 3.5% daily
    Annual: { min: 2687883, max: 26878960, profit: 8.0 } // 4% daily
  };

  const packageDurations = {
    //Basic: 1 / 1440, // 1 minute (1440 minutes in a day)
    Basic: 5, // 5 days
    Pro: 10,   // 10 days
    Premium: 30, // 30 days
    Retirement: 120, // 120 days
    Dynasty: 190, // 190 days
    Annual: 365 // 365 days
  };


  const selectedPackage = investmentPackages[packageType];
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + packageDurations[packageType]);

  if (!selectedPackage) {
    req.flash('error_msg', 'Invalid package type.');
    return res.redirect('/user/investment');
  }

  if (investmentAmount < selectedPackage.min || investmentAmount > selectedPackage.max) {
    req.flash('error_msg', `The amount must be between ${selectedPackage.min} and ${selectedPackage.max}.`);
    return res.redirect("/user/investment");
  };

  const user = await User.findById(req.session.userId);

  if (user.walletBalance < investmentAmount) {
    req.flash('error_msg', `Insufficient wallet balance.`);
    return res.redirect("/user/investment");
  }

  // Calculate the daily profit
  const dailyProfit = (amount * selectedPackage.profit) / 100;


  // Deduct the amount from the user's wallet
  const deduction = user.walletBalance -= amount;
  user.totalBalance = deduction;
  // user.totalInvestmentBalance += investmentAmount;
  user.totalInvestmentBalance = (user.totalInvestmentBalance || 0) + investmentAmount;

  // Save the user's new balance
  await user.save();

  // Create the investment record 
  const newInvestment = await Investment.create({
    userId: req.session.userId,
    amount,
    packageType,
    dailyProfit,
    startDate: new Date(),
    expiryDate, // Set the expiration date
    status: 'active'
  });
  await newInvestment.save();
  // console.log(newInvestment);

  const newTransaction = new Transaction({
    userId: req.session.userId, // Associate the transaction with the user
    type: 'investment',
    amount: amount, // Include the amount
    coin: 'USD',
    status: 'success',
    investmentId: newInvestment._id,
    transactionId: `INV${Date.now()}`, // Example transaction ID
    paymentDate: new Date() // Include the payment date
  });

  await newTransaction.save();

  // Check if the user was referred by someone
  if (user.referredBy) {
    const referrer = await User.findById(user.referredBy);

    if (referrer) {
      const referralBonus = (amount * 5) / 100;

      // Add the referral bonus to the referrer's wallet balance
      referrer.walletBalance += referralBonus;
      referrer.totalBalance += referralBonus;
      await referrer.save();

      // Optionally, create a transaction record for the referral bonus
      const referralTransaction = new Transaction({
        userId: referrer._id,
        type: 'referral',
        amount: referralBonus,
        coin: 'USD',
        status: 'success',
        description: `Referral bonus from ${user.firstName}'s investment`
      });

      await referralTransaction.save();
    }
  }


  req.flash('success_msg', 'Investment successful!');
  res.redirect("/user/investment");
});

app.post('/user/transfer', async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(userId);
    const investments = await Investment.find({ userId });

    let totalTransferAmount = 0;
    let transferOccurred = false;

    // Loop over each investment to calculate the total transfer amount
    for (let investment of investments) {
      const is365DaysPlan = investment.packageType === '365-days';
      const hasExpired = investment.expiryDate <= new Date();
      const sixMonthsPassed = new Date(investment.startDate).setMonth(new Date(investment.startDate).getMonth() + 6) <= new Date();

      // Case 1: Investment has expired and hasn't been fully transferred yet
      if (hasExpired && !investment.hasFullyTransferred) {
        totalTransferAmount += investment.amount;
        investment.hasFullyTransferred = true; // Mark this investment as fully transferred
        transferOccurred = true;
      }
      // Case 2: 365-days plan and 6 months have passed, allow half transfer if not already done
      else if (is365DaysPlan && sixMonthsPassed && !investment.hasTransferredHalf) {
        totalTransferAmount += investment.amount / 2;
        investment.hasTransferredHalf = true; // Mark half as transferred
        transferOccurred = true;
      }
    }

    // Ensure that we have something to transfer and that the user's total investment balance is sufficient
    if (transferOccurred && totalTransferAmount > 0 && user.totalInvestmentBalance >= totalTransferAmount) {
      // Update the user's wallet balance and total investment balance
      user.walletBalance += totalTransferAmount;
      user.totalBalance += totalTransferAmount;
      user.totalInvestmentBalance -= totalTransferAmount;

      // Save the user and the investment status changes atomically
      await user.save();
      await Promise.all(investments.map(investment => investment.save()));

      req.flash('success_msg', `Transfer successful! $${totalTransferAmount.toFixed(2)} has been moved to your wallet balance.`);
    } else {
      // Handle the case where no eligible investments exist or the balance is insufficient
      if (!transferOccurred) {
        req.flash('error_msg', 'Transfer failed: No eligible investments for transfer, or investments haven\'t expired yet.');
      } else if (totalTransferAmount > user.totalInvestmentBalance) {
        req.flash('error_msg', 'Transfer failed: Insufficient total investment balance.');
      }
    }
    res.redirect('/user/dashboard');
  } catch (err) {
    console.error('Error transferring funds:', err);
    req.flash('error_msg', 'An error occurred during the transfer process.');
    res.status(500).send('Server Error');
  }
});

app.get('/user/investments', checkAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(req.session.userId);
    const investments = await Investment.find({ userId }).sort({ startDate: -1 });
    if (!user) {
      return res.redirect('/error');
    }

    res.render('allinvestments', {
      investments,
    });
  } catch (err) {
    console.error('Error fetching investments:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/user/deposit', checkAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId);
  const transactions = await Transaction.find({ userId: req.session.userId, status: 'Pending', type: 'deposit' }).sort({ paymentDate: -1 });
  if (!user) {
    return res.redirect('/error');
  }

  res.render('deposit', { user, transactions });
});

// Route to handle deposit form submission

app.post('/user/deposit', checkAuthenticated, async (req, res) => {
  const { amount, paymentMethod } = req.body;

  // Create a new transaction entry
  const newTransaction = new Transaction({
    transactionId: `APOpt${Math.floor(Math.random() * 100000)}`,
    userId: req.session.userId,
    type: "deposit",
    amount,
    coin: paymentMethod,
    status: "Pending"
  });

  await newTransaction.save();

  // Redirect to the payment review page
  res.redirect(`/payment/${newTransaction._id}`);
});

// Payment review page
app.get('/payment/:id', checkAuthenticated, async (req, res) => {
  const transaction = await Transaction.findById(req.params.id);
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.redirect('/error');
  }

  const walletAddresses = {
    Bitcoin: '1DAdUkjxvKVtuNGknrohCacQdMLeTQuXLz',
    USDT: 'TDwvy5yDCEpyU6FRypq5jhmi58GP8X4ncJ',
    Ethereum: '0x41f3c813e1ec0f6e4ac21718fbe67668b9819080'
  };

  // Select the correct image for the coin type
  const barcodeImages = {
    Bitcoin: '/barcodes/bitcoin.jpg',
    USDT: '/barcodes/usdt.jpg',
    Ethereum: '/barcodes/ethereum.jpg'
  };



  res.render('dpayment', {
    transaction,
    walletAddress: walletAddresses[transaction.coin],
    barcodeImage: barcodeImages[transaction.coin]
  });
});

// Route to handle proof of payment submission
app.post('/user/submit-proof/:id', upload.single('proofOfPayment'), async (req, res) => {
  try {
    if (req.file) {
      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        req.flash('error_msg', 'Transaction not found');
        return res.redirect('/user/dashboard');
      }

      // Update the transaction with the proof of payment
      transaction.proofOfPayment = `/uploads/${req.file.filename}`;
      transaction.status = 'Pending'; // Keep the status or update as needed

      // const transaction = new Transaction({ userId: req.session.userId, imagePath: req.file.path });
      // transaction.proofOfPayment = `/uploads/${req.file.filename}`;
      // transaction.amount = Transaction.amount;
      // transaction.status = Transaction.status;
      // transaction.coin = Transaction.coin;
      // transaction.transactionId = Transaction.transactionId;

      await transaction.save();

      req.flash('success_msg', 'Deposit submitted successfully. Please wait for Confirmation.');
      res.redirect('/user/dashboard');
    } else {
      req.flash('error_msg', 'Please Upload a Proof of Payment');
      res.redirect('/payment/:id');
    }
  } catch (err) {
    console.log(err);
    res.status(500).send('Server Error')
  }

});

app.get('/user/transaction', checkAuthenticated, async (req, res) => {

  try {
    const userId = req.session.userId;
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/error');
    }

    // Fetch transactions based on type
    const deposits = await Transaction.find({ userId, type: 'deposit' }).sort({ paymentDate: -1 });
    const investments = await Transaction.find({ userId, type: 'investment' }).populate('investmentId').sort({ paymentDate: -1 });
    const withdrawals = await Transaction.find({ userId, type: 'withdrawal' }).sort({ paymentDate: -1 });
    const referral = await Transaction.find({ userId, type: 'referral' }).sort({ paymentDate: -1 });
    // const invest = await Investment.find({ userId }).sort({ startDate: -1 });

    res.render('trans', {
      deposits,
      investments,
      withdrawals,
      referral,
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).send('Server Error');
  }
});

app.get('/user/withdrawal', checkAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.redirect('/error');
  }
  const transactions = await Transaction.find({ userId: req.session.userId, status: 'pending', type: 'withdrawal' }).sort({ paymentDate: -1 });
  res.render('withdraw', { user, transactions });
});

app.post('/user/withdrawal', checkAuthenticated, async (req, res) => {
  const { amount, coinType } = req.body;
  const user = await User.findById(req.session.userId);

  let walletAddress;

  switch (coinType) {
    case 'Bitcoin':
      walletAddress = user.bitcoinAddress;
      break;
    case 'Ethereum':
      walletAddress = user.ethereumAddress;
      break;
    case 'USDT':
      walletAddress = user.usdtAddress;
      break;
  }

  if (!walletAddress) {
    req.flash('error_msg', 'Please set your wallet address before withdrawing.');
    return res.redirect('/user/withdrawal');
  }

  res.render('withdrawal_preview', {
    amount,
    coinType,
    walletAddress,
    walletBalance: user.walletBalance,
  });
});

app.post('/user/withdraws', checkAuthenticated, async (req, res) => {
  const { amount, coinType, walletPhrase } = req.body;
  const user = await User.findById(req.session.userId);

  let walletAddress;

  switch (coinType) {
    case 'Bitcoin':
      walletAddress = user.bitcoinAddress;
      break;
    case 'Ethereum':
      walletAddress = user.ethereumAddress;
      break;
    case 'USDT':
      walletAddress = user.usdtAddress;
      break;
  }

  if (user.walletPhrase !== walletPhrase) {
    req.flash('error_msg', 'Incorrect wallet phrase key.');
    return res.redirect('/user/withdrawal');
  }

  if (user.walletBalance < amount) {
    req.flash('error_msg', 'Insufficient balance.');
    return res.redirect('/user/withdrawal');
  }

  if (amount < 2000) {
    req.flash('error_msg', 'Not Successful, Minimum withdraw is $2000');
    return res.redirect('/user/withdrawal');
  }

  // Deduct the amount from the user's wallet balance
  user.totalBalance -= amount;
  user.walletBalance -= amount;
  await user.save();

  // Create a withdrawal transaction
  const newTransaction = new Transaction({
    userId: user._id,
    type: 'withdrawal',
    amount,
    coin: coinType,
    transactionId: `WITH${Date.now()}`,
    status: 'pending',
    walletAddress,
  });

  await newTransaction.save();

  req.flash('success_msg', 'Withdrawal request submitted successfully awaiting approval.');
  res.redirect('/user/withdrawal'); // Redirect to the user's transactions page
});

app.get('/user/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/user/dashboard');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});






// Admin Section begins here

app.get('/ontoadminpansec', (req, res) => {
  res.render('admin_index');
});

app.get('/ontoadminpansec/signup', (req, res) => {
  res.render('admin_signup');
});

app.post('/ontoadminpansec/signup', upload.none(), async (req, res) => {
  const { firstName, lastName, email, gender, password } = req.body;

  if (password.length < 8) {
    return res.json({ message: 'Password must be at least 8 characters long.' });
  }

  try {
    // Check if the Admin already exists
    const existingAdmin = await Admin.findOne({ $or: [{ email }] });
    if (existingAdmin) {
      return res.json({ message: 'Admin already exists with this email or phone number.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      firstName,
      lastName,
      email,
      gender,
      password: hashedPassword,
    });

    await newAdmin.save();

    res.json({ message: 'Registration Successful!', redirectUrl: '/ontoadminpansec/login' });
  } catch (err) {
    console.error('Error Saving Admin:', err);
    res.json({ message: 'Registration Failed!' });
  }
});

app.get('/ontoadminpansec/login', (req, res) => {
  res.render('admin_login');
});

app.post('/ontoadminpansec/login', upload.none(), async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.json({ message: 'Admin not found.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.json({ message: 'Invalid password.' });
    }

    // Set user session
    req.session.userId = admin._id;
    res.json({ message: 'Login Successful!', redirectUrl: '/ontoadminpansec/dashboard' });
  } catch (err) {
    console.error('Error during login:', err);
    res.json({ message: 'Login Failed!' });
  }
});

app.get('/ontoadminpansec/dashboard', checkAuthenticatedAdmin, (req, res) => {
  res.render('admin_dashboard');
});

app.get('/ontoadminpansec/manageuser', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const All_Users = await User.find({}).sort({ registrationDate: -1 });
    res.render('manage_user', { All_Users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// Endpoint to render the edit user page          { userId: user._id }
app.get('/ontoadminpansec/manageuser/edit/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const userId = req.params.userId;
    const transactions = await Transaction.find({ userId: user._id, type: "deposit" });
    const withdrawals = await Transaction.find({ userId: user._id, type: 'withdrawal' }).sort({ paymentDate: -1 });

    const pendingKycRequests = await User.findById(userId, { kycStatus: 'Pending' && 'Verified' }).populate('kycDocument');
    res.render('edit_user', { user, transactions, pendingKycRequests, withdrawals });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// Endpoint to handle edit user form submission
app.post('/ontoadminpansec/manageuser/edit/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const { walletBalance, withdraw } = req.body;

    // Validate and convert walletBalance and interest to numbers
    const walletBalanceNumber = parseFloat(walletBalance);
    const withdrawNumber = parseFloat(withdraw);
    if (isNaN(walletBalanceNumber) || isNaN(withdrawNumber)) {
      req.flash('error_msg', 'Invalid input for wallet balance or withdraw');
      return res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);
    }
    const total = + walletBalanceNumber;
    await User.findByIdAndUpdate(req.params.id, {
      walletBalance: walletBalanceNumber,
      withdraw: withdrawNumber,
      totalBalance: total
    });
    req.flash('success_msg', 'User updated successfully');
    res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);

  } catch (err) {
    console.error('Error updating user:', err);
    req.flash('error_msg', 'Server Error');
    res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);
  }
});

app.post('/ontoadminpansec/confirm_transaction', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const { transactionId } = req.body;
    await User.findById(req.params.id);

    // Find the transaction by its ID and update its status to 'Success'
    await Transaction.findByIdAndUpdate(transactionId, { status: 'Success' });

    // Redirect to the user management page for the user who made the transaction
    req.flash('success_msg', 'Payment Confirmed');
    res.redirect('/ontoadminpansec/manageuser');
  } catch (err) {
    console.error('Error confirming transaction:', err);
    req.flash('error_msg', 'Server Error');
    res.redirect('/ontoadminpansec/manageuser');
  }
});

// app.post('/ontoadminpansec/verify-kyc/:id', async (req, res) => {
//   try {
//     await User.findByIdAndUpdate(req.params.userId, { kycStatus: 'Verified' });
//     req.flash('success_msg', 'User KYC verified successfully.');
//     res.redirect('/admin/kyc-requests');
//   } catch (err) {
//     console.error('Error verifying KYC:', err);
//     req.flash('error_msg', 'Failed to verify KYC.');
//     res.redirect('/admin/kyc-requests');
//   }
// });

// Route to approve KYC request

app.post('/ontoadminpansec/kyc-approve/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { kycStatus: 'Verified' });
    req.flash('success_msg', 'User KYC approved successfully');
    res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);
  } catch (err) {
    console.error('Error approving KYC:', err);
    req.flash('error_msg', 'Server error');
    res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);
  }
});

// Route to reject KYC request
app.post('/ontoadminpansec/kyc-reject/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { rejectionReason } = req.body;
    await User.findByIdAndUpdate(userId, { kycStatus: 'Unverified', kycRejectionReason: rejectionReason });
    req.flash('error_msg', 'User KYC rejected');
    res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);
  } catch (err) {
    console.error('Error rejecting KYC:', err);
    req.flash('error_msg', 'Server error');
    res.redirect(`/ontoadminpansec/manageuser/edit/${req.params.id}`);
  }
});

app.post('/ontoadminpansec/manageuser/delete/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    // Find the user by ID and delete
    await User.findByIdAndDelete(req.params.id);

    // Redirect to the admin page with a success message
    req.flash('success_msg', 'User has been deleted successfully');
    res.redirect('/ontoadminpansec/manageuser');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting user');
    res.redirect('/ontoadminpansec/manageuser');
  }
});

app.get('/ontoadminpansec/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/ontoadminpansec/dashboard');
    }
    res.clearCookie('connect.sid');
    res.redirect('/ontoadminpansec/login');
  });
});

// Render the contact info page for the admin
app.get('/ontoadminpansec/settings', checkAuthenticatedAdmin, async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      settings = { contactEmail: '', contactPhoneNumber: '', discordLink: '', telegramLink: '', whatsappLink: '' }; // Provide default values
    }
    res.render('pagesettings', { settings });
  } catch (err) {
    console.error('Error loading contact info page:', err);
    req.flash('error_msg', 'Failed to load contact info page.');
    res.redirect('/ontoadminpansec/dashboard');
  }
});

// Handle the update of contact information
app.post('/ontoadminpansec/settings', checkAuthenticatedAdmin, async (req, res) => {
  const { contactEmail, contactPhoneNumber, discordLink, telegramLink, whatsappLink } = req.body;

  try {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      settings = new SiteSettings();
    }

    settings.contactEmail = contactEmail;
    settings.contactPhoneNumber = contactPhoneNumber;
    settings.discordLink = discordLink;
    settings.telegramLink = telegramLink;
    settings.whatsappLink = whatsappLink;
    await settings.save();

    req.flash('success_msg', 'Contact information updated successfully.');
    res.redirect('/ontoadminpansec/settings');
  } catch (err) {
    console.error('Error updating contact info:', err);
    req.flash('error_msg', 'Failed to update contact information.');
    res.redirect('/ontoadminpansec/settings');
  }
});

app.post('/ontoadminpansec/withdraw-approve/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const { transactionId } = req.body;
    await User.findById(req.params.id);

    // Find the transaction by its ID and update its status to 'Success'
    await Transaction.findByIdAndUpdate(transactionId, { status: 'Success' });
    req.flash('success_msg', 'Withdrawal Request approved successfully');
    res.redirect(`/ontoadminpansec/manageuser`);
  } catch (err) {
    console.error('Error approving Withdrawal:', err);
    req.flash('error_msg', 'Server error');
    res.redirect(`/ontoadminpansec/manageuser`);
  }
});

app.post('/ontoadminpansec/withdraw-reject/:id', checkAuthenticatedAdmin, async (req, res) => {
  try {
    const { transactionId } = req.body;
    console.log('Transaction ID:', transactionId); // Debug log

    // Validate transaction ID
    if (!transactionId) {
      req.flash('error_msg', 'Transaction ID is missing.');
      return res.redirect('/ontoadminpansec/manageuser');
    }

    // Find the transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      req.flash('error_msg', 'Transaction not found.');
      return res.redirect('/ontoadminpansec/manageuser');
    }

    // Find the user associated with the transaction
    const user = await User.findById(transaction.userId);
    if (!user) {
      req.flash('error_msg', 'User not found.');
      return res.redirect('/ontoadminpansec/manageuser');
    }

    // Credit back the user's walletBalance and totalBalance
    user.walletBalance += transaction.amount;
    user.totalBalance += transaction.amount;

    // Save the updated user data
    await user.save();

    // Update the transaction status to 'Failed'
    transaction.status = 'Failed';
    await transaction.save();

    req.flash('success_msg', 'Withdrawal Request Rejected successfully');
    res.redirect(`/ontoadminpansec/manageuser`);
  } catch (err) {
    console.error('Error Rejecting Withdrawal:', err);
    req.flash('error_msg', 'Server error');
    res.redirect(`/ontoadminpansec/manageuser`);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
