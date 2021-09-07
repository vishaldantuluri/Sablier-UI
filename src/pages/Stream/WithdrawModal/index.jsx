import React, { Component } from "react";
import classnames from "classnames";
import PropTypes from "prop-types";
import Slider from "rc-slider/lib/Slider";

import { BigNumber as BN } from "bignumber.js";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";

import DashedLine from "../../../components/DashedLine";
import Modal from "../../../components/Modal";
import PrimaryButton from "../../../components/PrimaryButton";
import SablierABI from "../../../abi/sablier";

import { addPendingTx as web3AddPendingTx } from "../../../redux/ducks/web3connect";
import { countDecimalPoints, roundToDecimalPoints } from "../../../helpers/format-utils";

import "rc-slider/assets/index.css";
import "./withdraw-modal.scss";

const initialState = {
  amountToWithdraw: 0,
  submitted: false,
  submissionError: "",
};

class WithdrawModal extends Component {
  constructor(props) {
    super(props);

    this.state = { ...initialState };
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    const initialAmountToWithdraw = Math.floor(nextProps.stream.funds.withdrawable / 2);
    const amountToWithdraw = prevState.amountToWithdraw || initialAmountToWithdraw;

    if (amountToWithdraw !== prevState.amountToWithdraw) {
      return { amountToWithdraw };
    }
    return prevState;
  }

  componentDidUpdate(_prevProps, _prevState) {
    const { hasPendingTransactions, onWithdrawSuccess } = this.props;
    const { amountToWithdraw, submitted, submissionError } = this.state;
    if (submitted && !submissionError && !hasPendingTransactions) {
      onWithdrawSuccess(amountToWithdraw);
    }
  }

  onClose() {
    const { onClose } = this.props;
    this.setState(initialState);
    onClose();
  }

  async onSubmitWithdraw() {
    const { account, addPendingTx, sablierAddress, stream, web3 } = this.props;
    const { amountToWithdraw } = this.state;

    const adjustedAmount = new BN(amountToWithdraw).multipliedBy(10 ** stream.token.decimals).toFixed(0);
    let gasPrice = "8000000000";
    try {
      gasPrice = await web3.eth.getGasPrice();
      gasPrice = BN(gasPrice || "0")
        .plus(BN("1000000000"))
        .toString();
      // eslint-disable-next-line no-empty
    } catch {}
    new web3.eth.Contract(SablierABI, sablierAddress).methods
      .withdrawFromStream(stream.rawStreamId, adjustedAmount)
      .send({ from: account, gasPrice })
      .once("transactionHash", transactionHash => {
        addPendingTx(transactionHash);
        this.setState({ submitted: true });
      })
      .once("error", err => {
        this.handleError(err);
      });
  }

  getSliderStep() {
    const { stream } = this.props;
    const decimalPoints = countDecimalPoints(stream.funds.withdrawable);
    if (decimalPoints === 0) {
      return 1;
    }
    if (decimalPoints === 1) {
      return 0.1;
    }
    if (decimalPoints === 2) {
      return 0.01;
    }
    return stream.funds.withdrawable / 100;
  }

  handleError(err) {
    const { t } = this.props;
    this.setState({
      submissionError: err.toString() || t("error"),
      submitted: false,
    });
  }

  render() {
    const { hasPendingTransactions, stream, t } = this.props;
    const { amountToWithdraw, submissionError } = this.state;

    const isWithdrawable = stream.funds.withdrawable !== 0;
    const disabled = !isWithdrawable || hasPendingTransactions;
    const sliderStep = this.getSliderStep();
    return (
      <Modal
        onClose={() => {
          if (!hasPendingTransactions) {
            this.onClose();
          }
        }}
      >
        <div className="withdraw-modal">
          <span className="withdraw-modal__title-label">{t("selectAmount")}</span>
          <div className="withdraw-modal__separator" />
          <div className="withdraw-modal__funds-container">
            <DashedLine
              className="withdraw-modal__dashed-line"
              leftLabel={t("earnedSoFar")}
              rightLabel={`${stream.funds.paid.toLocaleString()} ${stream.token.symbol}`}
            />
            <DashedLine
              className="withdraw-modal__dashed-line"
              leftLabel={t("withdrawnSoFar")}
              rightLabel={`${stream.funds.withdrawn.toLocaleString()} ${stream.token.symbol}`}
            />
            <DashedLine
              className="withdraw-modal__dashed-line"
              leftLabel={t("youCanWithdrawUpTo")}
              rightLabel={`${stream.funds.withdrawable.toLocaleString()} ${stream.token.symbol}`}
            />
          </div>
          <Slider
            className="withdraw-modal__slider"
            defaultValue={amountToWithdraw}
            disabled={disabled}
            max={stream.funds.withdrawable}
            min={sliderStep}
            onChange={value => this.setState({ amountToWithdraw: value })}
            step={sliderStep}
          />
          <PrimaryButton
            className={classnames(["withdraw-modal__button", "primary-button--yellow"])}
            disabled={disabled}
            disabledWhileLoading
            label={`${t("withdraw.verbatim")} ${roundToDecimalPoints(amountToWithdraw, 3)} ${stream.token.symbol}`}
            loading={hasPendingTransactions}
            onClick={() =>
              this.setState({ submissionError: "" }, () => {
                this.onSubmitWithdraw();
              })
            }
          />
          {!submissionError ? null : <div className={classnames("withdraw-modal__error-label")}>{submissionError}</div>}
        </div>
      </Modal>
    );
  }
}

WithdrawModal.propTypes = {
  account: PropTypes.string,
  addPendingTx: PropTypes.func.isRequired,
  hasPendingTransactions: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onWithdrawSuccess: PropTypes.func.isRequired,
  sablierAddress: PropTypes.string,
  stream: PropTypes.object.isRequired,
  web3: PropTypes.object.isRequired,
  t: PropTypes.shape({}),
};

WithdrawModal.defaultProps = {
  account: "",
  sablierAddress: "",
  t: {},
};

export default connect(
  state => ({
    account: state.web3connect.account,
    hasPendingTransactions: !!state.web3connect.transactions.pending.length,
    sablierAddress: state.addresses.sablierAddress,
    web3: state.web3connect.web3,
  }),
  dispatch => ({
    addPendingTx: path => dispatch(web3AddPendingTx(path)),
  }),
)(withTranslation()(WithdrawModal));
