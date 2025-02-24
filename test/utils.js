const crypto = require('crypto');

exports.deployLeniaContract = async (ethers) => {
    [owner, ...otherAccounts] = await ethers.getSigners()

    LeniaDescriptor = await ethers.getContractFactory("LeniaDescriptor")
    const leniaDescriptorLibrary = await LeniaDescriptor.deploy()

    Lenia = await ethers.getContractFactory("Lenia", {
        libraries: {
            LeniaDescriptor: leniaDescriptorLibrary.address
        }
    })
    const otherAddresses = otherAccounts.map(account => account.address)
    // Simulate splitting Ether balance among a group of accounts
    const payeeAdresses = [
        owner.address, // StockMouton DAO
        otherAddresses[0], // Team Member 1
        otherAddresses[1], // Team Member 2
        otherAddresses[2], // Team Member 3
    ]
    const payeeShares = [450, 225, 225, 100]

    const contractPromise = Lenia.deploy(payeeAdresses, payeeShares)

    return contractPromise
}

exports.deployLeniaMetadataContract = async (ethers) => {
    [owner, ...otherAccounts] = await ethers.getSigners()

    LeniaMetadata = await ethers.getContractFactory("LeniaMetadata")
    const contractPromise = LeniaMetadata.deploy()

    return contractPromise
}

exports.generatePrivateKey = () => {
    return `0x${crypto.randomBytes(32).toString('hex')}`
}

exports.traitTypeAttrsMap = [
    'Colormap', 'Family', 'Ki', 'Aura', 'Weight', 'Robustness', 'Avoidance', 'Velocity', 'Spread'
]
exports.attrsMap = [
    // ["Black White", "Carmine Blue", "Carmine Green", "Cinnamon", "Golden", "Msdos", "Rainbow", "Rainbow_transparent", "Salvia", "White Black"],
    ["Alizarin", "Black White", "Carmine Blue", "Cinnamon", "City", "Golden", "Laurel", "Msdos", "Pink Beach", "Rainbow", "River Leaf", "Salvia", "Summer", "White Black"],
    ["Genesis", "Aquarium", "Terrarium", "Aerium", "Ignis", "Maelstrom", "Amphibium", "Pulsium", "Etherium", "Nexus", "Oscillium", "Kaleidium"],
    ["Kiai", "Kiroku", "Kihaku", "Hibiki"],
    ["Etheric", "Mental", "Astral", "Celestial", "Spiritual"],
    ["Fly", "Feather", "Welter", "Cruiser", "Heavy"],
    ["Aluminium", "Iron", "Steel", "Tungsten", "Vibranium"],
    ["Kawarimi", "Shunshin", "Raiton", "Hiraishin", "Kamui"],
    ["Immovable", "Unrushed", "Swift", "Turbo", "Flash"],
    ["Demie", "Standard", "Magnum", "Jeroboam", "Balthazar"],
]

exports.decodeContractMetdata = function decodeContractMetdata(encodedContractMetadata) {
    const contractMetadataJSON = encodedContractMetadata.replace('data:application/json,', '');
    return JSON.parse(contractMetadataJSON)
}