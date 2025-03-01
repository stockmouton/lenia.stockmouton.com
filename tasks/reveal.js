const path = require('path');
const fs = require('fs')

const ROOT_FOLDER = path.join(__dirname, '..')
const METADATA_FOLDER = path.join(ROOT_FOLDER, 'static', 'metadata')

let currentTimer;

function sleep(ms) {
    console.log(`Waiting for ${ms/1000} more seconds`)

    return new Promise((resolve) => {
        currentTimer = setTimeout(resolve, ms);
    });
}

function checkIndex(oriMetadataFolder, index) {
    console.log(`Checking index ${index}`)

    const dst_json = path.join(METADATA_FOLDER, `${index}.json`)
    if (!fs.existsSync(dst_json)) {
        const src_json = path.join(oriMetadataFolder, `${index}.json`)
        console.log(` - Copying ${src_json} -> ${dst_json}`)
        fs.copyFileSync(src_json, dst_json)
    }
    const dst_mp4 = path.join(METADATA_FOLDER, `${index}.mp4`)
    if (!fs.existsSync(dst_mp4)) {
        const src_mp4 = path.join(oriMetadataFolder, `${index}.mp4`)
        console.log(` - Copying ${src_mp4} -> ${dst_mp4}`)
        fs.copyFileSync(src_mp4, dst_mp4)
    }
    const dst_gif = path.join(METADATA_FOLDER, `${index}.gif`)
    if (!fs.existsSync(dst_gif)) {
        const src_gif = path.join(oriMetadataFolder, `${index}.gif`)
        console.log(` - Copying ${src_gif} -> ${dst_gif}`)
        fs.copyFileSync(src_gif, dst_gif)
    }
}

task("reveal", "listen and reveal",  async (taskArgs, hre) => {
    if (hre.hardhatArguments.network == null) {
        throw new Error('Please add the missing --network <localhost|rinkeby|mainnet> argument')
    }

    let oriMetadataFolder;
    if (hre.hardhatArguments.network == 'localhost') {
        oriMetadataFolder = path.join(ROOT_FOLDER, 'metadata', 'fake')
    } else {
        oriMetadataFolder = path.join(ROOT_FOLDER, 'metadata', 'ori')
    }

    const LeniaDescriptorLibraryDeployment = await hre.deployments.get('LeniaDescriptor')
    const LeniaContractFactory = await hre.ethers.getContractFactory("Lenia", {
        libraries: {
            LeniaDescriptor: LeniaDescriptorLibraryDeployment.address
        },
    })
    const LeniaDeployment = await hre.deployments.get('Lenia')
    const lenia = LeniaContractFactory.attach(LeniaDeployment.address)


    const maxSupply = await lenia.MAX_SUPPLY()
    let totalSupply = await lenia.totalSupply()
    console.log(`Max supply is ${maxSupply}`)
    console.log(`current total supply is ${totalSupply}`)

    // Check that up to totalSupply we have already put all files
    for (let index = 0; index < totalSupply; index++) {
        checkIndex(oriMetadataFolder, index)
    }

    console.log(`listening to contract at ${lenia.address}`)
    filter = {
        topics: [
            ethers.utils.id("Transfer(address,address,uint256)")
        ]
    }
    lenia.on(filter, async (from, to, tokenID) => {
        // console.log(from, to, tokenID)
        if(from == '0x0000000000000000000000000000000000000000') {
            console.log(`Our new friend ${to} has mint a Lenia!`)
            checkIndex(oriMetadataFolder, tokenID)

            totalSupply = await lenia.totalSupply()
            console.log(`Current total supply is ${totalSupply}`)
            if (totalSupply == maxSupply){
                console.log(`Current total supply (${totalSupply}) has reached max supply (${maxSupply})`)
                console.log(`Clearing timeout`)
                clearTimeout(timer);
            }
        }
    })

    while (totalSupply != maxSupply) {
        await sleep(60000)    
    }
})
