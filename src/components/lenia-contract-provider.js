import React, { createContext, useState, useContext, useEffect } from 'react'
import { useQueryParam, StringParam } from "use-query-params";
import { useWeb3 } from "./web3-provider"
import artifactsMain from '../artifacts/mainnet.json'
import artifactsRinkeby from '../artifacts/rinkeby.json'
import artifactsLocalhost from '../artifacts/localhost.json'

const leniaContractContext = createContext(null)

export const SALE_STATUSES = {
  NOT_STARTED: 'NOT_STARTED',
  PRESALE: 'PRESALE',
  PUBLIC: 'PUBLIC',
}

const getArtifacts = function(network) {
  if (process?.env.NODE_ENV === 'production' && network === 'rinkeby') return artifactsRinkeby
  if (process?.env.NODE_ENV === 'production') return artifactsMain
  return artifactsLocalhost
}
const getSaleStatus = (isPresaleActive, isSaleActive) => {
  if (isSaleActive) return SALE_STATUSES.PUBLIC
  if (isPresaleActive) return SALE_STATUSES.PRESALE
  return SALE_STATUSES.NOT_STARTED
}

export const LeniaContractProvider = ({ children }) => {
  const { web3Provider, account } = useWeb3()
  const [contract, setContract] = useState(null)
  const [metadataContract, setMetadataContract] = useState(null)
  const [totalLeniaSupply, setTotalLeniaSupply] = useState(0)
  const [totalLeniaMinted, setTotalLeniaMinted] = useState(0)
  const [saleStatus, setSaleStatus] = useState(SALE_STATUSES.NOT_STARTED)
  const [isEligibleForPresale, setIsEligibleForPresale] = useState(false)

  const [network] = useQueryParam("network", StringParam)
  
  const initContract = () => {
    try {
      const artifacts = getArtifacts(network)
      const contract = web3Provider ? new web3Provider.eth.Contract(artifacts.contracts.Lenia.abi, artifacts.contracts.Lenia.address) : null
      setContract(contract)
      if (artifacts.contracts.LeniaMetadata) {
        const metadataContract = web3Provider ? new web3Provider.eth.Contract(artifacts.contracts.LeniaMetadata.abi, artifacts.contracts.LeniaMetadata.address) : null
        setMetadataContract(metadataContract)
      }
    } catch(error) {
      console.log(error)
      // Contract is not deployed or the wrong artifact is being imported
    }
  }
  
  useEffect(initContract, [web3Provider])

  const initBlockchainData = async () => {
    if (contract) {
      const isPresaleActive = await contract.methods.isPresaleActive().call({from: account})
      const isEligibleForPresale = await contract.methods.isEligibleForPresale(account).call({from: account})
      const isSaleActive = await contract.methods.isSaleActive().call({ from: account })      
      const totalLeniaSupply = await contract.methods.MAX_SUPPLY().call({ from: account }) || 0
      const totalLeniaMinted = await contract.methods.totalSupply().call({ from: account }) || 0
      setSaleStatus(getSaleStatus(isPresaleActive, isSaleActive))
      setIsEligibleForPresale(isEligibleForPresale)
      setTotalLeniaSupply(parseInt(totalLeniaSupply, 10))
      setTotalLeniaMinted(parseInt(totalLeniaMinted, 10))
    }
  }

  const updateBlockchainData = async () => {
    try {
      const totalLeniaMinted = await contract.methods.totalSupply().call({ from: account })
      const isEligibleForPresale = await contract.methods.isEligibleForPresale(account).call({from: account})
      
      setIsEligibleForPresale(isEligibleForPresale)
      setTotalLeniaMinted(parseInt(totalLeniaMinted, 10))
    } catch(error) {
      // Do nothing, this is just a read operation, no need to scare the user.
    }
  }

  return (
    <>
      <leniaContractContext.Provider value={{
        contract,
        metadataContract,
        initContract,
        initBlockchainData,
        updateBlockchainData,
        saleStatus,
        isEligibleForPresale,
        totalLeniaSupply,
        totalLeniaMinted,
      }}>{children}</leniaContractContext.Provider>
    </>
  )
}

export const useLeniaContract = () => useContext(leniaContractContext)