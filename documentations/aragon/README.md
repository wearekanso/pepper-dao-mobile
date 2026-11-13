> **Outdated (2026-11-11):** these documents describe the retired DAO `0xDedD…284B` (Staged Proposal Processor + lockToVote + multisig). The app now targets the PEPPER MainDao `0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213`, with one TokenVoting 1.4 plugin per voting track and vePEPPER voting power. Current addresses: `config/aragon-governance.ts`.

# Aragon DAO Integration Documentation

Complete technical documentation for integrating Pepper DAO governance with Aragon OSx.

---

## 📖 Quick Start

### **For Developers**

1. **Start Here:** [PEPPER_DAO_INTEGRATION_GUIDE.md](./PEPPER_DAO_INTEGRATION_GUIDE.md)
   - Complete implementation guide (50+ pages)
   - Step-by-step instructions
   - Code examples and patterns

2. **Quick Reference:** [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
   - Contract addresses
   - Most-used functions
   - Common patterns
   - Keep this open while coding

3. **Update ABIs:** [HOW_TO_UPDATE_ABIS.md](./HOW_TO_UPDATE_ABIS.md)
   - Replace minimal ABIs with full implementation ABIs
   - ⚠️ Required before implementation

---

## 📚 Documentation Files

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[PEPPER_DAO_INTEGRATION_GUIDE.md](./PEPPER_DAO_INTEGRATION_GUIDE.md)** | Complete implementation guide | Read first, reference during development |
| **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** | Developer cheat sheet | Keep open while coding |
| **[COMPLETE_GOVERNANCE_ARCHITECTURE.md](./COMPLETE_GOVERNANCE_ARCHITECTURE.md)** | System architecture | Understand the big picture |
| **[HOW_TO_UPDATE_ABIS.md](./HOW_TO_UPDATE_ABIS.md)** | ABI management guide | Before starting implementation |

---

## 🏗️ Governance Architecture

### **2-Stage Governance Flow**

```
Proposal Created
        ↓
┌─────────────────────────────────────────┐
│ STAGE 1: SPICY MINISTER APPROVAL        │
│ • 3 Spicy Ministers                    │
│ • Threshold: 2 out of 3 approvals     │
│ • Duration: 7 days                     │
│ • Admin-only (not in mobile app)       │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ STAGE 2: PUBLIC GOVERNANCE              │
│         (Lock-to-Vote)                  │
│ • All PEPPER token holders             │
│ • Lock tokens to vote                  │
│ • Voting Power = Locked PEPPER amount  │
│ • Duration: 7 days                     │
│ • Mobile app focuses here              │
└─────────────┬───────────────────────────┘
              ↓
         EXECUTION
```

**Full Details:** [COMPLETE_GOVERNANCE_ARCHITECTURE.md](./COMPLETE_GOVERNANCE_ARCHITECTURE.md)

---

## 🔑 Key Contract Information

### **Main Contracts**

| Contract | Proxy Address | Implementation |
|----------|---------------|----------------|
| **Staged Processor** | `0x8d639bd52301D7265Ebd1E6d4B0813f1CF190415` | `0xfca5b9bbe4f2a8b1bbcc0a6b32e9df53c6b7c135` |
| **Token Voting** | `0x4D1a5e3AFe6d5bC9dfE72A8332b67C916CEb77ff` | `0xf1b3ed4f41509f1661def5518d198e0b0257ffe1` |
| **Multisig** | `0x1FecF1c23dD2E8C7adF937583b345277d39bD554` | - |

**Network:** Chiliz Mainnet (Chain ID: 88888)

### **ABIs**

ABIs are configured in: `config/aragon-abis.ts`

⚠️ **Action Required:** Update minimal ABIs with full implementation ABIs
- See: [HOW_TO_UPDATE_ABIS.md](./HOW_TO_UPDATE_ABIS.md)

---

## 🚀 Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Read-Only** | 3-5 days | Display proposals, vote tallies |
| **Phase 2: Voting** | 3-5 days | Connect wallet, cast votes |
| **Phase 3: Polish** | 2-3 days | Error handling, testing |
| **Total** | **8-13 days** | Production-ready governance |

**Detailed breakdown:** [PEPPER_DAO_INTEGRATION_GUIDE.md](./PEPPER_DAO_INTEGRATION_GUIDE.md#implementation-timeline)

---

## 📝 Implementation Checklist

### **Before You Start**

- [ ] Read [PEPPER_DAO_INTEGRATION_GUIDE.md](./PEPPER_DAO_INTEGRATION_GUIDE.md)
- [ ] Update ABIs following [HOW_TO_UPDATE_ABIS.md](./HOW_TO_UPDATE_ABIS.md)
- [ ] Bookmark [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- [ ] Review [COMPLETE_GOVERNANCE_ARCHITECTURE.md](./COMPLETE_GOVERNANCE_ARCHITECTURE.md)

### **Phase 1: Read-Only (3-5 days)**

- [ ] Set up contract configuration
- [ ] Implement proposal fetching
- [ ] Build proposal list UI
- [ ] Build proposal detail UI
- [ ] Integrate IPFS metadata
- [ ] Add countdown timers
- [ ] Implement filtering/sorting
- [ ] Add loading/error states

### **Phase 2: Voting (3-5 days)**

- [ ] Integrate wallet connection
- [ ] Build voting modal flow
- [ ] Implement lock amount input
- [ ] Add eligibility checks
- [ ] Implement vote transaction
- [ ] Add transaction status UI
- [ ] Handle all error cases
- [ ] Add optimistic updates

### **Phase 3: Polish (2-3 days)**

- [ ] Add animations/transitions
- [ ] Optimize performance
- [ ] Add analytics tracking
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Update documentation
- [ ] QA testing
- [ ] Bug fixes

---

## 🔍 Key Concepts

### **Lock-to-Vote Mechanism**

- Users **lock** PEPPER tokens to vote (NOT staking)
- Tokens locked for **voting period only** (7 days)
- **Voting Power = Locked PEPPER amount**
- Tokens **unlock automatically** after voting ends
- No staking rewards - this is for governance only

### **Mobile App Scope**

**In Scope:**
- ✅ Stage 2 (Public Governance) proposals
- ✅ Voting interface for PEPPER holders
- ✅ Vote tallies and results

**Out of Scope:**
- ❌ Stage 1 (Spicy Minister) voting
- ❌ Proposal creation (admin only)
- ❌ Execution UI

---

## 🧪 Testing

### **Test Connection**

```typescript
import { ARAGON_CONTRACTS } from '@/config/aragon-abis';
import { createPublicClient, http } from 'viem';
import { chiliz } from '@/config/chains';

const client = createPublicClient({
  chain: chiliz,
  transport: http(),
});

// Test proposal count
const count = await client.readContract({
  address: ARAGON_CONTRACTS.stagedProcessor.address,
  abi: ARAGON_CONTRACTS.stagedProcessor.abi,
  functionName: 'proposalCount',
});

console.log('✅ Connected! Proposals:', count.toString());
```

---

## 🔗 External Resources

- **Aragon OSx Docs:** https://docs.aragon.org/osx-contracts/
- **Chiliscan Explorer:** https://chiliscan.com/
- **Chiliz RPC:** https://rpc.chiliz.com
- **Feature Spec:** `../features/governance-aragon.md`

---

## 💡 Common Issues & Solutions

### **Error: `0x1bebc115`**

**Problem:** Using proxy ABI instead of implementation ABI  
**Solution:** Use implementation ABI from `config/aragon-abis.ts`

### **Error: "Function not found"**

**Problem:** Minimal ABI doesn't include all functions  
**Solution:** Update ABIs following [HOW_TO_UPDATE_ABIS.md](./HOW_TO_UPDATE_ABIS.md)

### **Can't fetch proposals**

**Problem:** Wrong contract address or ABI  
**Solution:** Verify addresses in `config/aragon-abis.ts` match documentation

---

## 📊 Documentation Stats

- **Total Files:** 4 core documents
- **Total Content:** ~70 pages
- **Code Examples:** 15+
- **Diagrams:** 5+
- **Implementation Time:** 8-13 days

---

## ✅ Status

**Investigation:** ✅ Complete  
**Documentation:** ✅ Complete  
**ABIs Obtained:** ✅ Complete  
**Code Structure:** ✅ Updated  
**Ready for Implementation:** ✅ YES

**Next Step:** Update ABIs, then start Phase 1

---

**Last Updated:** December 17, 2024  
**Version:** 2.0 (Cleaned & Production-Ready)  
**Status:** Ready for Implementation 🚀
